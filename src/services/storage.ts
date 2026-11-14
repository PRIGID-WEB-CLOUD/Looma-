import { auth } from './firebase';
import {
  classifyUploadMime,
  extractStorageKeyFromUrl,
  getInlineMediaByteLimit,
  isRetryableUploadHttpError,
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
  return (await res.json()) as StorageStatus;
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

async function readFileAsDataUrl(file: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read selected file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

async function encodeImageWithinLimit(
  file: File,
  maxDataUrlLength: number
): Promise<{ dataUrl: string; contentType: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode image for upload fallback.'));
      el.src = objectUrl;
    });

    const maxSide = maxDataUrlLength <= 220_000 ? 720 : 1280;
    const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
    let targetW = Math.max(1, Math.round((img.width || 800) * scale));
    let targetH = Math.max(1, Math.round((img.height || 800) * scale));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas compression unavailable in this browser.');
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = targetW;
      canvas.height = targetH;
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      for (const quality of [0.82, 0.68, 0.54, 0.4]) {
        const candidate = canvas.toDataURL('image/jpeg', quality);
        if (candidate.length <= maxDataUrlLength) {
          return { dataUrl: candidate, contentType: 'image/jpeg' };
        }
      }
      targetW = Math.max(160, Math.round(targetW * 0.72));
      targetH = Math.max(160, Math.round(targetH * 0.72));
    }

    throw new Error('Image is too large to store without an active media server.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function fallbackInlineMediaUpload(
  file: File,
  folder: StorageFolder,
  kind: UploadMediaKind,
  contentType: string,
  onProgress?: (percent: number) => void
): Promise<UploadedStorageObject> {
  const limit = getInlineMediaByteLimit(folder, kind);
  onProgress?.(55);

  if (kind === 'image') {
    const rawDataUrl = file.size <= Math.floor(limit * 0.72) ? await readFileAsDataUrl(file) : '';
    const resolved =
      rawDataUrl && rawDataUrl.length <= limit
        ? { dataUrl: rawDataUrl, contentType }
        : await encodeImageWithinLimit(file, limit);
    onProgress?.(100);
    return {
      ok: true,
      provider: 'cloudflare-r2',
      bucket: 'inline-fallback',
      key: `inline/${folder}/${Date.now()}-${file.name}`,
      url: resolved.dataUrl,
      kind,
      contentType: resolved.contentType,
      size: resolved.dataUrl.length,
    };
  }

  if (file.size <= Math.floor(limit * 0.72)) {
    const dataUrl = await readFileAsDataUrl(file);
    if (dataUrl.length <= limit) {
      onProgress?.(100);
      return {
        ok: true,
        provider: 'cloudflare-r2',
        bucket: 'inline-fallback',
        key: `inline/${folder}/${Date.now()}-${file.name}`,
        url: dataUrl,
        kind,
        contentType,
        size: dataUrl.length,
      };
    }
  }

  throw new Error(
    `Cloudflare R2 upload endpoint returned HTTP 405 on this host. Large ${kind} files require the Express /api/storage/upload backend.`
  );
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

    let parsed: { error?: string } & Partial<UploadedStorageObject> = {};
    try {
      parsed = JSON.parse(primary.responseText || '{}') as {
        error?: string;
      } & Partial<UploadedStorageObject>;
    } catch {
      // Non-JSON response (e.g. HTML 405 from static server)
    }

    if (primary.status >= 200 && primary.status < 300 && parsed.url && parsed.key) {
      onProgress?.(100);
      return parsed as UploadedStorageObject;
    }

    if (!isRetryableUploadHttpError(primary.status)) {
      throw new UploadHttpError(
        primary.status,
        parsed.error || `Cloudflare R2 upload failed (HTTP ${primary.status}).`
      );
    }

    // Attempt presigned direct PUT if /api/storage/presign is reachable
    try {
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
      if (presignRes.ok) {
        const presignData = (await presignRes.json()) as {
          bucket?: string;
          key?: string;
          uploadUrl?: string;
          publicUrl?: string;
        };
        if (presignData.uploadUrl && presignData.key && presignData.publicUrl) {
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
        }
      }
    } catch {
      // Fall through to inline compressed media fallback
    }

    return await fallbackInlineMediaUpload(
      file,
      folder,
      classified.kind,
      classified.contentType,
      onProgress
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
