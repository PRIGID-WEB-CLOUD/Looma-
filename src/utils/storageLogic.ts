export const STORAGE_FOLDERS = ['posts', 'stories', 'avatars'] as const;
export type StorageFolder = (typeof STORAGE_FOLDERS)[number];

export type UploadMediaKind = 'image' | 'video' | 'audio';

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024; // 50 MB

export interface R2EnvInput {
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
  R2_PUBLIC_URL?: string;
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
  publicUrl: string;
}

export interface R2ConfigParseResult {
  configured: boolean;
  missing: string[];
  bucketName: string | null;
  publicUrlConfigured: boolean;
  config: R2Config | null;
}

function isPlaceholderSecret(val: string | undefined): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  if (!trimmed) return true;
  return (
    trimmed.startsWith('MY_') ||
    trimmed === 'changeme' ||
    trimmed === 'replace-me'
  );
}

export function normalizePublicBaseUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return '';
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function parseR2Config(env: R2EnvInput): R2ConfigParseResult {
  const missing: string[] = [];
  const accountId = env.R2_ACCOUNT_ID?.trim() || '';
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim() || '';
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim() || '';
  const bucketName = env.R2_BUCKET_NAME?.trim() || '';

  if (isPlaceholderSecret(accountId)) missing.push('R2_ACCOUNT_ID');
  if (isPlaceholderSecret(accessKeyId)) missing.push('R2_ACCESS_KEY_ID');
  if (isPlaceholderSecret(secretAccessKey)) missing.push('R2_SECRET_ACCESS_KEY');
  if (isPlaceholderSecret(bucketName)) missing.push('R2_BUCKET_NAME');

  const publicUrl = normalizePublicBaseUrl(env.R2_PUBLIC_URL);

  if (missing.length > 0) {
    return {
      configured: false,
      missing,
      bucketName: isPlaceholderSecret(bucketName) ? null : bucketName,
      publicUrlConfigured: Boolean(publicUrl),
      config: null,
    };
  }

  return {
    configured: true,
    missing: [],
    bucketName,
    publicUrlConfigured: Boolean(publicUrl),
    config: {
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      publicUrl,
    },
  };
}

const IMAGE_MIME_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

const VIDEO_MIME_MAP: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/ogg': 'ogv',
  'video/x-m4v': 'm4v',
};

const AUDIO_MIME_MAP: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/webm': 'webm',
};

const EXT_TO_MIME: Record<string, { kind: UploadMediaKind; mime: string; ext: string }> = {
  jpg: { kind: 'image', mime: 'image/jpeg', ext: 'jpg' },
  jpeg: { kind: 'image', mime: 'image/jpeg', ext: 'jpg' },
  png: { kind: 'image', mime: 'image/png', ext: 'png' },
  webp: { kind: 'image', mime: 'image/webp', ext: 'webp' },
  gif: { kind: 'image', mime: 'image/gif', ext: 'gif' },
  avif: { kind: 'image', mime: 'image/avif', ext: 'avif' },
  mp4: { kind: 'video', mime: 'video/mp4', ext: 'mp4' },
  webm: { kind: 'video', mime: 'video/webm', ext: 'webm' },
  mov: { kind: 'video', mime: 'video/quicktime', ext: 'mov' },
  m4v: { kind: 'video', mime: 'video/x-m4v', ext: 'm4v' },
  ogv: { kind: 'video', mime: 'video/ogg', ext: 'ogv' },
  mp3: { kind: 'audio', mime: 'audio/mpeg', ext: 'mp3' },
  wav: { kind: 'audio', mime: 'audio/wav', ext: 'wav' },
  ogg: { kind: 'audio', mime: 'audio/ogg', ext: 'ogg' },
  m4a: { kind: 'audio', mime: 'audio/mp4', ext: 'm4a' },
  aac: { kind: 'audio', mime: 'audio/aac', ext: 'aac' },
  flac: { kind: 'audio', mime: 'audio/flac', ext: 'flac' },
};

export interface ClassifiedUpload {
  valid: boolean;
  kind?: UploadMediaKind;
  contentType?: string;
  extension?: string;
  maxBytes?: number;
  error?: string;
}

export function classifyUploadMime(
  rawContentType: string,
  filename: string = ''
): ClassifiedUpload {
  const mime = rawContentType.split(';')[0].trim().toLowerCase();
  const extMatch = filename.trim().toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  const fileExt = extMatch?.[1] || '';

  if (mime === 'image/svg+xml' || fileExt === 'svg') {
    return {
      valid: false,
      error: 'SVG files are not permitted for security reasons. Use PNG, JPG, WebP, GIF, or AVIF.',
    };
  }

  if (IMAGE_MIME_MAP[mime]) {
    return {
      valid: true,
      kind: 'image',
      contentType: mime === 'image/jpg' ? 'image/jpeg' : mime,
      extension: IMAGE_MIME_MAP[mime],
      maxBytes: MAX_IMAGE_BYTES,
    };
  }

  if (VIDEO_MIME_MAP[mime]) {
    return {
      valid: true,
      kind: 'video',
      contentType: mime,
      extension: VIDEO_MIME_MAP[mime],
      maxBytes: MAX_MEDIA_BYTES,
    };
  }

  if (AUDIO_MIME_MAP[mime]) {
    return {
      valid: true,
      kind: 'audio',
      contentType: mime === 'audio/mp3' ? 'audio/mpeg' : mime,
      extension: AUDIO_MIME_MAP[mime],
      maxBytes: MAX_MEDIA_BYTES,
    };
  }

  if ((!mime || mime === 'application/octet-stream') && fileExt && EXT_TO_MIME[fileExt]) {
    const inferred = EXT_TO_MIME[fileExt];
    return {
      valid: true,
      kind: inferred.kind,
      contentType: inferred.mime,
      extension: inferred.ext,
      maxBytes: inferred.kind === 'image' ? MAX_IMAGE_BYTES : MAX_MEDIA_BYTES,
    };
  }

  return {
    valid: false,
    error: 'Unsupported file type. Select an image, video, or audio file.',
  };
}

export function normalizeStorageFolder(rawFolder: string | undefined): StorageFolder {
  const cleaned = (rawFolder || '').trim().toLowerCase();
  if (STORAGE_FOLDERS.includes(cleaned as StorageFolder)) {
    return cleaned as StorageFolder;
  }
  return 'posts';
}

export function buildStorageObjectKey(
  uid: string,
  folder: StorageFolder,
  extension: string,
  nowMs: number = Date.now(),
  randomToken: string = Math.random().toString(36).slice(2, 10)
): string {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'user';
  const safeExt = extension.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8) || 'bin';
  const safeRand = randomToken.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16) || 'obj';
  return `uploads/${safeUid}/${folder}/${nowMs}-${safeRand}.${safeExt}`;
}

export function isValidStorageObjectKey(key: string): boolean {
  if (!key || key.length > 300) return false;
  if (key.includes('..') || key.includes('\\') || key.startsWith('/')) {
    return false;
  }
  return /^uploads\/[a-zA-Z0-9_-]{1,128}\/(posts|stories|avatars)\/[a-zA-Z0-9._-]{1,128}$/.test(
    key
  );
}

export function isOwnedStorageKey(uid: string, key: string): boolean {
  if (!uid || !isValidStorageObjectKey(key)) return false;
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return key.startsWith(`uploads/${safeUid}/`);
}

export function resolveStoragePublicUrl(
  key: string,
  publicBaseUrl?: string
): string {
  const normalizedBase = normalizePublicBaseUrl(publicBaseUrl);
  if (normalizedBase) {
    return `${normalizedBase}/${key}`;
  }
  return `/api/storage/file/${key}`;
}

export function extractStorageKeyFromUrl(
  url: string,
  publicBaseUrl?: string
): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/api/storage/file/')) {
    const raw = decodeURIComponent(trimmed.slice('/api/storage/file/'.length).split('?')[0]);
    return isValidStorageObjectKey(raw) ? raw : null;
  }

  if (trimmed.startsWith('/api/storage/file')) {
    try {
      const parsed = new URL(trimmed, 'http://localhost');
      const key = parsed.searchParams.get('key') || '';
      return isValidStorageObjectKey(key) ? key : null;
    } catch {
      return null;
    }
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.startsWith('/api/storage/file/')) {
      const raw = decodeURIComponent(parsed.pathname.slice('/api/storage/file/'.length));
      return isValidStorageObjectKey(raw) ? raw : null;
    }
    if (parsed.pathname === '/api/storage/file') {
      const key = parsed.searchParams.get('key') || '';
      return isValidStorageObjectKey(key) ? key : null;
    }
    const normalizedBase = normalizePublicBaseUrl(publicBaseUrl);
    if (normalizedBase && trimmed.startsWith(`${normalizedBase}/`)) {
      const key = trimmed.slice(normalizedBase.length + 1);
      return isValidStorageObjectKey(key) ? key : null;
    }
  } catch {
    return null;
  }

  return null;
}

export interface DecodedFirebaseJwtPayload {
  aud?: string;
  iss?: string;
  sub?: string;
  user_id?: string;
  email?: string;
  email_verified?: boolean;
  exp?: number;
}

export function decodeJwtPayload(
  token: string
): DecodedFirebaseJwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json =
      typeof Buffer !== 'undefined'
        ? Buffer.from(padded, 'base64').toString('utf8')
        : atob(padded);
    const parsed = JSON.parse(json) as DecodedFirebaseJwtPayload;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function validateDecodedFirebaseTokenClaims(
  payload: DecodedFirebaseJwtPayload | null,
  expectedProjectId: string,
  nowSec: number = Math.floor(Date.now() / 1000)
): { valid: boolean; reason?: string } {
  if (!payload) {
    return { valid: false, reason: 'Malformed authentication token.' };
  }
  if (payload.aud !== expectedProjectId) {
    return { valid: false, reason: 'Token audience mismatch.' };
  }
  if (payload.iss !== `https://securetoken.google.com/${expectedProjectId}`) {
    return { valid: false, reason: 'Token issuer mismatch.' };
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    return { valid: false, reason: 'Missing subject claim.' };
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    return { valid: false, reason: 'Authentication token has expired.' };
  }
  if (payload.email_verified !== true) {
    return { valid: false, reason: 'Verified email required.' };
  }
  return { valid: true };
}

export function isRetryableUploadHttpError(status: number): boolean {
  return status === 404 || status === 405 || status === 501;
}

export function getInlineMediaByteLimit(
  folder: StorageFolder,
  kind: UploadMediaKind
): number {
  if (folder === 'avatars') {
    return 200_000;
  }
  if (kind === 'image') {
    return 500_000;
  }
  return 680_000;
}

