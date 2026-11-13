import { auth } from './firebase';
import {
  classifyUploadMime,
  extractStorageKeyFromUrl,
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

export async function getStorageStatus(): Promise<StorageStatus> {
  const res = await fetch('/api/storage/status');
  if (!res.ok) {
    throw new Error('Unable to check Cloudflare R2 storage status.');
  }
  return (await res.json()) as StorageStatus;
}

export async function uploadMediaToCloudflareR2(
  file: File,
  folder: StorageFolder,
  onProgress?: (percent: number) => void
): Promise<UploadedStorageObject> {
  const classified = classifyUploadMime(file.type, file.name);
  if (!classified.valid || !classified.maxBytes || !classified.contentType) {
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

  return await new Promise<UploadedStorageObject>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/storage/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);
    xhr.setRequestHeader('Content-Type', classified.contentType || 'application/octet-stream');
    xhr.setRequestHeader('X-Content-Type', classified.contentType || 'application/octet-stream');
    xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
    xhr.setRequestHeader('X-Folder', folder);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && onProgress) {
        const pct = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      let parsed: { error?: string } & Partial<UploadedStorageObject> = {};
      try {
        parsed = JSON.parse(xhr.responseText || '{}') as {
          error?: string;
        } & Partial<UploadedStorageObject>;
      } catch {
        // Ignore parse error and fall back to status text
      }
      if (xhr.status >= 200 && xhr.status < 300 && parsed.url && parsed.key) {
        onProgress?.(100);
        resolve(parsed as UploadedStorageObject);
      } else {
        reject(
          new Error(
            parsed.error ||
              `Cloudflare R2 upload failed (HTTP ${xhr.status}).`
          )
        );
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error while uploading to Cloudflare R2.'));
    };

    xhr.send(file);
  });
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
