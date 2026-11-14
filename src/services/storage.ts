import { auth } from './firebase';
import {
  classifyUploadMime,
  extractStorageKeyFromUrl,
  inspectUploadHttpResponse,
  type StorageFolder,
  type UploadMediaKind,
} from '../utils/storageLogic';

export interface StorageStatus {
  provider: 'cloudflare-r2';
  configured: boolean;
  bucket: string | null;
  publicUrlConfigured: boolean;
  missing: string[];
}

export interface UploadedStorageObject {
  ok: true;
  provider: 'cloudflare-r2';
  bucket: string;
  key: string;
  url: string;
  kind: UploadMediaKind;
  contentType: string;
  size: number;
}

class UploadHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const res = await fetch('/api/storage/status');
  if (!res.ok) {
    throw new Error('Unable to check Cloudflare R2 storage status.');
  }
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as Partial<StorageStatus>;
    if (typeof parsed.configured === 'boolean') {
      return {
        provider: 'cloudflare-r2',
        configured: parsed.configured,
        bucket: parsed.bucket ?? null,
        publicUrlConfigured: Boolean(parsed.publicUrlConfigured),
        missing: Array.isArray(parsed.missing) ? parsed.missing : [],
      };
    }
  } catch {
    // Non-JSON response
  }
  throw new Error('Cloudflare R2 storage status endpoint returned non-JSON response.');
}

function sendXhrUpload(
  method: 'POST' | 'PUT',
  url: string,
  headers: Record<string, string>,
  body: Blob | File,
  onProgress?: (percent: number) => void
): Promise<{ status: number; responseText: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && onProgress) {
        const pct = Math.min(98, Math.round((evt.loaded / evt.total) * 100));
        onProgress(pct);
      }
    };
    xhr.onload = () => {
      resolve({ status: xhr.status, responseText: xhr.responseText || '' });
    };
    xhr.onerror = () => {
      reject(new Error('Network error while uploading to Cloudflare R2.'));
    };
    xhr.send(body);
  });
}

export async function uploadMediaToCloudflareR2(
  file: File,
  folder: StorageFolder,
  onProgress?: (percent: number) => void
): Promise<UploadedStorageObject> {
  const classified = classifyUploadMime(file.type, file.name);
  if (
    !classified.valid ||
    !classified.maxBytes ||
    !classified.contentType ||
    !classified.kind
  ) {
    throw new Error(classified.error || 'Unsupported file type.');
  }
  if (file.size === 0) {
    throw new Error('Selected file is empty.');
  }
  if (file.size > classified.maxBytes) {
    const maxMb = Math.round(classified.maxBytes / (1024 * 1024));
    throw new Error(
      `File exceeds the ${maxMb} MB limit for ${classified.kind} uploads.`
    );
  }

  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) {
    throw new Error(
      'Sign in with a verified Google account to upload files to Cloudflare R2.'
    );
  }

  const idToken = await currentUser.getIdToken();
  const uploadHeaders = {
    Authorization: `Bearer ${idToken}`,
    'Content-Type': classified.contentType || 'application/octet-stream',
    'X-Content-Type': classified.contentType || 'application/octet-stream',
    'X-Filename': encodeURIComponent(file.name),
    'X-Folder': folder,
  };

  try {
    const primary = await sendXhrUpload(
      'POST',
      '/api/storage/upload',
      uploadHeaders,
      file,
      onProgress
    );

    const inspection = inspectUploadHttpResponse(
      primary.status,
      primary.responseText
    );

    if (inspection.ok && inspection.parsed) {
      onProgress?.(100);
      return inspection.parsed as unknown as UploadedStorageObject;
    }

    if (!inspection.shouldRetryPresign) {
      throw new UploadHttpError(
        primary.status,
        inspection.errorMessage || `Cloudflare R2 upload failed (HTTP ${primary.status}).`
      );
    }

    // Retry once via real Cloudflare R2 presigned PUT URL if /api/storage/presign is available
    const presignRes = await fetch('/api/storage/presign', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: file.name,
        contentType: classified.contentType,
        size: file.size,
        folder,
      }),
    });

    const presignText = await presignRes.text();
    let presignData: {
      bucket?: string;
      key?: string;
      uploadUrl?: string;
      publicUrl?: string;
      error?: string;
    } = {};
    try {
      presignData = JSON.parse(presignText) as typeof presignData;
    } catch {
      presignData = {};
    }

    if (
      presignRes.ok &&
      presignData.uploadUrl &&
      presignData.key &&
      presignData.publicUrl
    ) {
      const putRes = await sendXhrUpload(
        'PUT',
        presignData.uploadUrl,
        { 'Content-Type': classified.contentType },
        file,
        onProgress
      );
      if (putRes.status >= 200 && putRes.status < 300) {
        onProgress?.(100);
        return {
          ok: true,
          provider: 'cloudflare-r2',
          bucket: presignData.bucket || 'r2',
          key: presignData.key,
          url: presignData.publicUrl,
          kind: classified.kind,
          contentType: classified.contentType,
          size: file.size,
        };
      }
      throw new UploadHttpError(
        putRes.status,
        `Cloudflare R2 direct upload failed (HTTP ${putRes.status}).`
      );
    }

    throw new UploadHttpError(
      presignRes.status || primary.status,
      presignData.error ||
        `Cloudflare R2 upload endpoint returned invalid response (HTTP ${primary.status}).`
    );
  } catch (err) {
    if (err instanceof UploadHttpError) {
      throw err;
    }
    throw err instanceof Error
      ? err
      : new Error('Cloudflare R2 upload failed.');
  }
}

export async function deleteUploadedMedia(urlOrKey: string): Promise<void> {
  const key =
    urlOrKey.startsWith('uploads/')
      ? urlOrKey
      : extractStorageKeyFromUrl(urlOrKey);
  if (!key) return;

  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return;

  const idToken = await currentUser.getIdToken();
  await fetch(`/api/storage/file?key=${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  }).catch(() => {});
}
