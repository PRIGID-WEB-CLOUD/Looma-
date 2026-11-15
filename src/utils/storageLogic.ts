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
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_ACCESS_KEY_ID?: string;
  CLOUDFLARE_SECRET_ACCESS_KEY?: string;
  CLOUDFLARE_R2_BUCKET_NAME?: string;
  CLOUDFLARE_R2_PUBLIC_DOMAIN?: string;
  CLOUDFLARE_R2_PUBLIC_URL?: string;
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

function cleanEnvValue(val: string | undefined): string {
  if (!val) return '';
  let cleaned = val.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

function isPlaceholderSecret(val: string | undefined): boolean {
  const trimmed = cleanEnvValue(val);
  if (!trimmed) return true;
  return (
    trimmed.startsWith('MY_') ||
    trimmed === 'changeme' ||
    trimmed === 'replace-me'
  );
}

export function normalizePublicBaseUrl(rawUrl: string | undefined): string {
  const trimmed = cleanEnvValue(rawUrl);
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

function firstConfiguredValue(
  ...candidates: Array<string | undefined>
): string {
  for (const candidate of candidates) {
    if (!isPlaceholderSecret(candidate)) {
      return cleanEnvValue(candidate);
    }
  }
  return '';
}

export function parseR2Config(env: R2EnvInput): R2ConfigParseResult {
  const missing: string[] = [];
  const accountId = firstConfiguredValue(
    env.R2_ACCOUNT_ID,
    env.CLOUDFLARE_ACCOUNT_ID
  );
  const accessKeyId = firstConfiguredValue(
    env.R2_ACCESS_KEY_ID,
    env.CLOUDFLARE_ACCESS_KEY_ID
  );
  const secretAccessKey = firstConfiguredValue(
    env.R2_SECRET_ACCESS_KEY,
    env.CLOUDFLARE_SECRET_ACCESS_KEY
  );
  const bucketName = firstConfiguredValue(
    env.R2_BUCKET_NAME,
    env.CLOUDFLARE_R2_BUCKET_NAME
  );

  if (!accountId) missing.push('R2_ACCOUNT_ID');
  if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
  if (!bucketName) missing.push('R2_BUCKET_NAME');

  const publicUrl = normalizePublicBaseUrl(
    env.R2_PUBLIC_URL ||
      env.CLOUDFLARE_R2_PUBLIC_DOMAIN ||
      env.CLOUDFLARE_R2_PUBLIC_URL
  );

  if (missing.length > 0) {
    return {
      configured: false,
      missing,
      bucketName: bucketName || null,
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

export interface R2BackendErrorInfo {
  code: 'R2_UNAUTHORIZED' | 'R2_BUCKET_NOT_FOUND' | 'R2_BACKEND_ERROR';
  status: number;
  message: string;
  isAuthError: boolean;
}

export function classifyR2BackendError(err: unknown): R2BackendErrorInfo {
  const obj = (err && typeof err === 'object' ? err : {}) as {
    Code?: string;
    code?: string;
    name?: string;
    message?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const errCode = String(obj.Code || obj.code || obj.name || '').trim();
  const rawMessage = String(obj.message || '').trim();
  const httpStatus = obj.$metadata?.httpStatusCode;
  const combined = `${errCode} ${rawMessage}`.toLowerCase();

  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    combined.includes('unauthorized') ||
    combined.includes('invalidaccesskeyid') ||
    combined.includes('signaturedoesnotmatch') ||
    combined.includes('accessdenied')
  ) {
    return {
      code: 'R2_UNAUTHORIZED',
      status: 502,
      isAuthError: true,
      message:
        'Cloudflare R2 rejected the configured API credentials (Unauthorized). Verify your R2 API Token has Object Read & Write permissions and matches your Account ID in Secrets.',
    };
  }

  if (combined.includes('nosuchbucket')) {
    return {
      code: 'R2_BUCKET_NOT_FOUND',
      status: 502,
      isAuthError: false,
      message:
        'Configured Cloudflare R2 bucket was not found. Verify R2_BUCKET_NAME / CLOUDFLARE_R2_BUCKET_NAME in Secrets.',
    };
  }

  return {
    code: 'R2_BACKEND_ERROR',
    status: 502,
    isAuthError: false,
    message: rawMessage
      ? `Cloudflare R2 upload failed: ${rawMessage}`
      : 'Cloudflare R2 storage request failed.',
  };
}

export interface UploadHttpInspection {
  ok: boolean;
  shouldRetryPresign: boolean;
  parsed: ({ code?: string; error?: string; url?: unknown; key?: unknown } & Record<string, unknown>) | null;
  errorMessage: string | null;
}

export function isRetryableUploadHttpError(
  status: number,
  hasValidJsonPayload: boolean = false
): boolean {
  if (status >= 200 && status < 300 && !hasValidJsonPayload) {
    return true;
  }
  return status === 404 || status === 405 || status === 501;
}

export function inspectUploadHttpResponse(
  status: number,
  responseText: string
): UploadHttpInspection {
  let parsed: ({ code?: string; error?: string; url?: unknown; key?: unknown } & Record<string, unknown>) | null = null;
  const trimmed = (responseText || '').trim();
  if (trimmed) {
    try {
      const candidate = JSON.parse(trimmed) as unknown;
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        parsed = candidate as { code?: string; error?: string; url?: unknown; key?: unknown } & Record<string, unknown>;
      }
    } catch {
      parsed = null;
    }
  }

  const hasValidPayload = Boolean(
    parsed &&
      typeof parsed.url === 'string' &&
      parsed.url.trim() &&
      typeof parsed.key === 'string' &&
      parsed.key.trim()
  );

  if (status >= 200 && status < 300 && hasValidPayload) {
    return {
      ok: true,
      shouldRetryPresign: false,
      parsed,
      errorMessage: null,
    };
  }

  const explicitError =
    parsed && typeof parsed.error === 'string' && parsed.error.trim()
      ? parsed.error.trim()
      : null;

  const shouldRetryPresign = explicitError
    ? status === 404 || status === 405 || status === 501
    : isRetryableUploadHttpError(status, hasValidPayload);

  return {
    ok: false,
    shouldRetryPresign,
    parsed,
    errorMessage:
      explicitError || `Cloudflare R2 upload failed (HTTP ${status}).`,
  };
}

function startsWithAscii(bytes: Uint8Array, ascii: string, offset: number = 0): boolean {
  if (bytes.length < offset + ascii.length) return false;
  for (let i = 0; i < ascii.length; i += 1) {
    if (bytes[offset + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

function matchesPrefix(bytes: Uint8Array, prefix: number[], offset: number = 0): boolean {
  if (bytes.length < offset + prefix.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (bytes[offset + i] !== prefix[i]) return false;
  }
  return true;
}

export function sniffMediaSignature(
  bytes: Uint8Array,
  expectedKind: UploadMediaKind,
  expectedContentType: string
): { valid: boolean; reason?: string } {
  if (!bytes || bytes.length < 4) {
    return { valid: false, reason: 'Uploaded file is too small or empty.' };
  }

  // Reject HTML / XML / SVG / Scripts disguised as media
  const headText = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, Math.min(256, bytes.length)))
    .trimStart()
    .toLowerCase();
  if (
    headText.startsWith('<!doctype') ||
    headText.startsWith('<html') ||
    headText.startsWith('<svg') ||
    headText.startsWith('<?xml') ||
    headText.startsWith('<script') ||
    startsWithAscii(bytes, '#!') ||
    matchesPrefix(bytes, [0x4d, 0x5a]) || // PE/EXE MZ
    matchesPrefix(bytes, [0x7f, 0x45, 0x4c, 0x46]) // ELF binary
  ) {
    return { valid: false, reason: 'Executable or markup payload rejected.' };
  }

  const mime = expectedContentType.toLowerCase();

  if (expectedKind === 'image') {
    if (mime === 'image/jpeg') {
      return matchesPrefix(bytes, [0xff, 0xd8, 0xff])
        ? { valid: true }
        : { valid: false, reason: 'File bytes do not match JPEG signature.' };
    }
    if (mime === 'image/png') {
      return matchesPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        ? { valid: true }
        : { valid: false, reason: 'File bytes do not match PNG signature.' };
    }
    if (mime === 'image/gif') {
      return startsWithAscii(bytes, 'GIF87a') || startsWithAscii(bytes, 'GIF89a')
        ? { valid: true }
        : { valid: false, reason: 'File bytes do not match GIF signature.' };
    }
    if (mime === 'image/webp') {
      return startsWithAscii(bytes, 'RIFF', 0) && startsWithAscii(bytes, 'WEBP', 8)
        ? { valid: true }
        : { valid: false, reason: 'File bytes do not match WebP signature.' };
    }
    if (mime === 'image/avif') {
      return startsWithAscii(bytes, 'ftyp', 4) &&
        (startsWithAscii(bytes, 'avif', 8) || startsWithAscii(bytes, 'avis', 8) || startsWithAscii(bytes, 'mif1', 8))
        ? { valid: true }
        : { valid: false, reason: 'File bytes do not match AVIF signature.' };
    }
    return { valid: false, reason: 'Unverified image signature.' };
  }

  if (expectedKind === 'video') {
    if (mime === 'video/mp4' || mime === 'video/quicktime' || mime === 'video/x-m4v') {
      const hasFtyp = startsWithAscii(bytes, 'ftyp', 4);
      const hasQtBox =
        startsWithAscii(bytes, 'moov', 4) ||
        startsWithAscii(bytes, 'wide', 4) ||
        startsWithAscii(bytes, 'mdat', 4);
      return hasFtyp || hasQtBox
        ? { valid: true }
        : { valid: false, reason: 'File bytes do not match MP4/MOV container signature.' };
    }
    if (mime === 'video/webm') {
      return matchesPrefix(bytes, [0x1a, 0x45, 0xdf, 0xa3])
        ? { valid: true }
        : { valid: false, reason: 'File bytes do not match WebM EBML signature.' };
    }
    if (mime === 'video/ogg') {
      return startsWithAscii(bytes, 'OggS')
        ? { valid: true }
        : { valid: false, reason: 'File bytes do not match Ogg signature.' };
    }
  }

  if (expectedKind === 'audio') {
    if (mime === 'audio/mpeg') {
      const isId3 = startsWithAscii(bytes, 'ID3');
      const isMpegFrame = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
      return isId3 || isMpegFrame
        ? { valid: true }
        : { valid: false, reason: 'File bytes do not match MP3 signature.' };
    }
    if (mime === 'audio/wav' || mime === 'audio/x-wav') {
      return startsWithAscii(bytes, 'RIFF', 0) && startsWithAscii(bytes, 'WAVE', 8)
        ? { valid: true }
        : { valid: false, reason: 'File bytes do not match WAV signature.' };
    }
    if (mime === 'audio/ogg') {
      return startsWithAscii(bytes, 'OggS')
        ? { valid: true }
        : { valid: false, reason: 'File bytes do not match Ogg audio signature.' };
    }
    if (mime === 'audio/flac') {
      return startsWithAscii(bytes, 'fLaC')
        ? { valid: true }
        : { valid: false, reason: 'File bytes do not match FLAC signature.' };
    }
    if (mime === 'audio/mp4') {
      return startsWithAscii(bytes, 'ftyp', 4)
        ? { valid: true }
        : { valid: false, reason: 'File bytes do not match M4A container signature.' };
    }
    if (mime === 'audio/aac') {
      const isAdts = bytes[0] === 0xff && (bytes[1] & 0xf0) === 0xf0;
      const isAdif = startsWithAscii(bytes, 'ADIF');
      return isAdts || isAdif
        ? { valid: true }
        : { valid: false, reason: 'File bytes do not match AAC signature.' };
    }
    if (mime === 'audio/webm') {
      return matchesPrefix(bytes, [0x1a, 0x45, 0xdf, 0xa3])
        ? { valid: true }
        : { valid: false, reason: 'File bytes do not match WebM audio signature.' };
    }
  }

  return { valid: false, reason: 'Unrecognized media file signature.' };
}

export type ParsedByteRangeResult =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'valid'; start: number; end: number; length: number; contentRange: string };

export function parseHttpRangeHeader(
  rangeHeader: string | null | undefined,
  totalSize: number
): ParsedByteRangeResult {
  if (!rangeHeader || !rangeHeader.trim()) {
    return { kind: 'none' };
  }
  if (!Number.isFinite(totalSize) || totalSize <= 0) {
    return { kind: 'invalid' };
  }

  const trimmed = rangeHeader.trim();
  const match = /^bytes=(\d*)-(\d*)$/i.exec(trimmed);
  if (!match) {
    return { kind: 'invalid' };
  }

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) {
    return { kind: 'invalid' };
  }

  let start: number;
  let end: number;

  if (!rawStart && rawEnd) {
    const suffixLen = Number(rawEnd);
    if (!Number.isInteger(suffixLen) || suffixLen <= 0) {
      return { kind: 'invalid' };
    }
    start = Math.max(0, totalSize - suffixLen);
    end = totalSize - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : totalSize - 1;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      start >= totalSize ||
      end < start
    ) {
      return { kind: 'invalid' };
    }
    end = Math.min(end, totalSize - 1);
  }

  return {
    kind: 'valid',
    start,
    end,
    length: end - start + 1,
    contentRange: `bytes ${start}-${end}/${totalSize}`,
  };
}

export function resolveStorageCacheControl(folderOrKey: string): string {
  if (folderOrKey === 'stories' || folderOrKey.includes('/stories/')) {
    return 'public, max-age=3600, must-revalidate';
  }
  if (folderOrKey === 'avatars' || folderOrKey.includes('/avatars/')) {
    return 'public, max-age=86400, must-revalidate';
  }
  return 'public, max-age=31536000, immutable';
}


