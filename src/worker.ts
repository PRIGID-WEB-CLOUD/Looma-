import { Hono, type Context, type Next } from 'hono';

export interface Fetcher {
  fetch(input: RequestInfo | URL | Request, init?: RequestInit): Promise<Response>;
}

export interface R2ObjectMetadata {
  key: string;
  size: number;
  etag?: string;
  httpEtag?: string;
  uploaded: Date;
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
  };
  customMetadata?: Record<string, string>;
}

export interface R2ObjectBody extends R2ObjectMetadata {
  body?: ReadableStream | null;
}

export interface R2Objects {
  objects: R2ObjectMetadata[];
}

export interface R2Bucket {
  head(key: string): Promise<R2ObjectMetadata | null>;
  get(
    key: string,
    options?: { range?: { offset?: number; length?: number } }
  ): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | ReadableStream | string | null | Blob,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    }
  ): Promise<R2ObjectMetadata | unknown>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: { prefix?: string; limit?: number }): Promise<R2Objects>;
}

import firebaseAppletConfig from '../firebase-applet-config.json' with { type: 'json' };
import {
  InMemoryRateLimiter,
  resolveAllowedCorsOrigin,
  signScopedHmacToken,
  verifyFirebaseIdTokenCrypto,
  verifyScopedHmacToken,
  type VerifiedAuthUser,
} from './utils/authLogic.ts';
import {
  buildCloudflareCallsUrl,
  cleanCallsEnvValue,
  extractCallsErrorMessage,
  formatCallsHeaders,
  isValidCallRoomId,
  isValidCallsSessionId,
  parseCallsConfig,
  parseIceServersConfig,
  parseTurnKeyConfig,
  resolveCallsIceServers,
  validateIceServersConfig,
  validateCallsClosePayload,
  validateCallsRenegotiatePayload,
  validateCallsTracksPayload,
} from './utils/callsLogic.ts';
import {
  buildStorageObjectKey,
  classifyR2BackendError,
  classifyUploadMime,
  isOwnedStorageKey,
  isValidStorageObjectKey,
  normalizeStorageFolder,
  parseHttpRangeHeader,
  parseR2Config,
  resolveConfiguredR2PublicUrl,
  resolveStorageCacheControl,
  resolveStoragePublicUrl,
  sniffMediaSignature,
  type R2Config,
} from './utils/storageLogic.ts';
import {
  buildCommerceUpstreamUrl,
  isBlockedPublicCommercePath,
  isCommerceSellerApiPath,
  parseCommerceConfig,
  requiresVerifiedBuyerAuth,
  resolveTenantForwardHeaders,
  sanitizeProxyHeaders,
} from './utils/commerceProxyLogic.ts';
import {
  buildFallbackLinkPreview,
  extractLinkMetadataFromHtml,
  isSafePublicPreviewUrl,
  type LinkPreviewMetadata,
} from './utils/linkPreviewLogic.ts';

export interface WorkerEnv {
  ASSETS?: Fetcher;
  R2_BUCKET?: R2Bucket;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_API_KEY?: string;
  FIREBASE_DATABASE_ID?: string;
  ALLOWED_ORIGINS?: string;
  PUBLIC_APP_URL?: string;
  APP_URL?: string;
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
  CLOUDFLARE_CALLS_APP_ID?: string;
  CLOUDFLARE_CALLS_APP_TOKEN?: string;
  CLOUDFLARE_TURN_KEY_ID?: string;
  CLOUDFLARE_TURN_KEY_TOKEN?: string;
  CALLS_STATE_SECRET?: string;
  TURN_URLS?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
  GEMINI_API_KEY?: string;
  COMMERCE_API_URL?: string;
  COMMERCE_DEFAULT_STORE_ID?: string;
  COMMERCE_INTERNAL_SSO_SECRET?: string;
  COMMERCE_PUBLISHABLE_KEY?: string;
  COMMERCE_ADMIN_DASHBOARD_URL?: string;
}

type AppVariables = {
  authUser: VerifiedAuthUser;
  authToken: string;
};

interface CallsSessionBindingPayload {
  [key: string]: unknown;
  kind: 'calls-session';
  uid: string;
  callId: string;
  cfSessionId: string;
  exp: number;
}

interface UploadTicketPayload {
  [key: string]: unknown;
  kind: 'r2-upload';
  uid: string;
  key: string;
  contentType: string;
  expectedSize: number;
  maxBytes: number;
  jti: string;
  exp: number;
}

const rateLimiter = new InMemoryRateLimiter();
const consumedUploadTickets = new Map<string, number>();
const recentCallSessionCache = new Map<
  string,
  {
    sessionId: string;
    sessionToken: string;
    iceServers: RTCIceServer[];
    hasTurnConfigured: boolean;
    iceExpiresAtMs: number;
    expiresAtMs: number;
  }
>();

function getFirebaseSettings(env: WorkerEnv) {
  return {
    projectId: (env.FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId || '').trim(),
    apiKey: (env.FIREBASE_API_KEY || firebaseAppletConfig.apiKey || '').trim(),
    databaseId: (
      env.FIREBASE_DATABASE_ID ||
      firebaseAppletConfig.firestoreDatabaseId ||
      '(default)'
    ).trim(),
  };
}

async function deriveHmacSecret(env: WorkerEnv, domain: string): Promise<string> {
  const configured = cleanCallsEnvValue(env.CALLS_STATE_SECRET);
  if (configured) {
    return `${domain}:${configured}`;
  }
  const callsSecret = cleanCallsEnvValue(env.CLOUDFLARE_CALLS_APP_TOKEN);
  const r2Secret = cleanCallsEnvValue(
    env.R2_SECRET_ACCESS_KEY || env.CLOUDFLARE_SECRET_ACCESS_KEY
  );
  const seed = `${domain}:${callsSecret}:${r2Secret}:${getFirebaseSettings(env).projectId}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateCryptoTokenHex(byteLen: number = 8): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getRateLimitClientKey(c: Context<{ Bindings: WorkerEnv; Variables: AppVariables }>): string {
  const authUser = c.get('authUser');
  if (authUser?.uid) return `uid:${authUser.uid}`;
  const ip =
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown-ip';
  return `ip:${ip}`;
}

async function createS3FallbackClient(env: WorkerEnv): Promise<{
  client: import('@aws-sdk/client-s3').S3Client;
  config: R2Config;
  PutObjectCommand: typeof import('@aws-sdk/client-s3').PutObjectCommand;
  GetObjectCommand: typeof import('@aws-sdk/client-s3').GetObjectCommand;
  HeadObjectCommand: typeof import('@aws-sdk/client-s3').HeadObjectCommand;
  ListObjectsV2Command: typeof import('@aws-sdk/client-s3').ListObjectsV2Command;
  DeleteObjectCommand: typeof import('@aws-sdk/client-s3').DeleteObjectCommand;
  getSignedUrl: typeof import('@aws-sdk/s3-request-presigner').getSignedUrl;
} | null> {
  const parsed = parseR2Config(env);
  if (!parsed.configured || !parsed.config) return null;
  const s3Mod = await import('@aws-sdk/client-s3');
  const presignMod = await import('@aws-sdk/s3-request-presigner');
  const client = new s3Mod.S3Client({
    region: 'auto',
    endpoint: parsed.config.endpoint,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: parsed.config.accessKeyId,
      secretAccessKey: parsed.config.secretAccessKey,
    },
  });
  return {
    client,
    config: parsed.config,
    PutObjectCommand: s3Mod.PutObjectCommand,
    GetObjectCommand: s3Mod.GetObjectCommand,
    HeadObjectCommand: s3Mod.HeadObjectCommand,
    ListObjectsV2Command: s3Mod.ListObjectsV2Command,
    DeleteObjectCommand: s3Mod.DeleteObjectCommand,
    getSignedUrl: presignMod.getSignedUrl,
  };
}

function extractStringArrayField(
  fields: Record<string, { arrayValue?: { values?: Array<{ stringValue?: string }> } }> | undefined,
  fieldName: string
): string[] {
  const vals = fields?.[fieldName]?.arrayValue?.values;
  if (!Array.isArray(vals)) return [];
  return vals
    .map((entry) => (typeof entry?.stringValue === 'string' ? entry.stringValue : ''))
    .filter(Boolean);
}

async function verifyCallRoomMembership(
  env: WorkerEnv,
  callId: string,
  uid: string,
  idToken: string
): Promise<{ allowed: boolean; status: number; error?: string }> {
  const fb = getFirebaseSettings(env);
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    fb.projectId
  )}/databases/${encodeURIComponent(fb.databaseId)}/documents/calls/${encodeURIComponent(
    callId
  )}`;

  const fetchRoom = async () =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

  let res = await fetchRoom();
  if (res.status === 404) {
    // Allow brief Firestore write propagation window before failing closed
    await new Promise((r) => setTimeout(r, 150));
    res = await fetchRoom();
  }

  if (res.status === 403) {
    return {
      allowed: false,
      status: 403,
      error: 'Forbidden: you are not a participant of this call room.',
    };
  }
  if (res.status === 404) {
    return {
      allowed: false,
      status: 404,
      error: 'Call room not found or no longer active.',
    };
  }
  if (!res.ok) {
    return {
      allowed: false,
      status: 502,
      error: `Unable to verify call room membership (HTTP ${res.status}).`,
    };
  }

  const docData = (await res.json()) as {
    fields?: Record<
      string,
      {
        stringValue?: string;
        arrayValue?: { values?: Array<{ stringValue?: string }> };
      }
    >;
  };

  const memberIds = extractStringArrayField(docData.fields, 'memberIds');
  const statusVal = docData.fields?.status?.stringValue || '';

  if (!memberIds.includes(uid)) {
    return {
      allowed: false,
      status: 403,
      error: 'Forbidden: user is not a member of this call room.',
    };
  }
  if (statusVal === 'ended') {
    return {
      allowed: false,
      status: 409,
      error: 'This call room has already ended.',
    };
  }

  return { allowed: true, status: 200 };
}

async function readUpstreamJson(cfRes: Response): Promise<Record<string, unknown>> {
  const rawText = await cfRes.text();
  if (!rawText.trim()) return {};
  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { raw: parsed };
  } catch {
    return { error: rawText.slice(0, 300) };
  }
}

export function createWorkerApp() {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: AppVariables }>();

  // Security headers + strict CORS allowlist for /api/*
  app.use('/api/*', async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('X-Frame-Options', 'SAMEORIGIN');

    const reqOrigin = c.req.header('origin');
    const configuredOrigins = [
      cleanCallsEnvValue(c.env.ALLOWED_ORIGINS),
      cleanCallsEnvValue(c.env.PUBLIC_APP_URL),
      cleanCallsEnvValue(c.env.APP_URL),
    ]
      .filter(Boolean)
      .join(',');

    const allowedOrigin = resolveAllowedCorsOrigin(
      reqOrigin,
      c.req.url,
      configuredOrigins
    );

    if (allowedOrigin) {
      c.header('Access-Control-Allow-Origin', allowedOrigin);
      c.header('Access-Control-Allow-Credentials', 'true');
      c.header('Vary', 'Origin');
      c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      c.header(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type, X-Content-Type, X-Filename, X-Folder, X-Call-Session-Token, X-Idempotency-Key, X-Store-Id, X-Publishable-Key, X-Api-Key'
      );
    } else if (reqOrigin) {
      if (c.req.method === 'OPTIONS') {
        return c.json({ error: 'CORS origin denied.' }, 403);
      }
    }

    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204);
    }

    await next();
  });

  // Reusable Cryptographic Firebase Auth Middleware
  const requireVerifiedAuth = async (
    c: Context<{ Bindings: WorkerEnv; Variables: AppVariables }>,
    next: Next
  ) => {
    const header = c.req.header('authorization') || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return c.json(
        { error: 'Authentication required. Sign in with a verified account.' },
        401
      );
    }

    const token = match[1].trim();
    const fb = getFirebaseSettings(c.env);
    try {
      const verified = await verifyFirebaseIdTokenCrypto(token, {
        expectedProjectId: fb.projectId,
        firebaseApiKey: fb.apiKey,
        requireVerifiedEmail: true,
        checkAccountActive: Boolean(fb.apiKey),
      });
      c.set('authUser', verified);
      c.set('authToken', token);
      await next();
    } catch (err) {
      return c.json(
        {
          error:
            err instanceof Error ? err.message : 'Unauthorized authentication token.',
        },
        401
      );
    }
  };

  // --- Storage Endpoints ---
  app.get('/api/storage/status', async (c) => {
    const hasNativeBinding = Boolean(c.env.R2_BUCKET);
    const s3Parsed = parseR2Config(c.env);
    const configured = hasNativeBinding || s3Parsed.configured;
    const publicUrl = resolveStoragePublicUrl(
      'probe',
      resolveConfiguredR2PublicUrl(c.env)
    );

    return c.json({
      provider: 'cloudflare-r2',
      configured,
      mode: hasNativeBinding ? 'r2-binding' : s3Parsed.configured ? 's3-api' : 'unconfigured',
      publicUrlConfigured: !publicUrl.startsWith('/api/storage/file/'),
    });
  });

  const handleStorageUpload = async (
    c: Context<{ Bindings: WorkerEnv; Variables: AppVariables }>
  ) => {
    const authUser = c.get('authUser');
    const rate = rateLimiter.check(`upload:${authUser.uid}`, 30, 60_000);
    if (!rate.allowed) {
      return c.json(
        { error: 'Upload rate limit exceeded. Please wait a moment and retry.' },
        429
      );
    }

    const rawFilenameHeader = c.req.header('x-filename') || '';
    let filename = '';
    try {
      filename = rawFilenameHeader ? decodeURIComponent(rawFilenameHeader) : '';
    } catch {
      filename = rawFilenameHeader;
    }

    const folder = normalizeStorageFolder(c.req.header('x-folder'));
    const rawContentType =
      c.req.header('x-content-type') ||
      c.req.header('content-type') ||
      'application/octet-stream';

    const classified = classifyUploadMime(rawContentType, filename);
    if (
      !classified.valid ||
      !classified.kind ||
      !classified.contentType ||
      !classified.extension ||
      !classified.maxBytes
    ) {
      return c.json({ error: classified.error || 'Unsupported file type.' }, 400);
    }

    const declaredLength = Number(c.req.header('content-length') || '0');
    if (declaredLength > classified.maxBytes) {
      const maxMb = Math.round(classified.maxBytes / (1024 * 1024));
      return c.json(
        { error: `File exceeds the ${maxMb} MB limit for ${classified.kind} uploads.` },
        413
      );
    }

    const buf = new Uint8Array(await c.req.arrayBuffer());
    if (buf.byteLength === 0) {
      return c.json({ error: 'Upload payload is empty.' }, 400);
    }
    if (buf.byteLength > classified.maxBytes) {
      const maxMb = Math.round(classified.maxBytes / (1024 * 1024));
      return c.json(
        { error: `File exceeds the ${maxMb} MB limit for ${classified.kind} uploads.` },
        413
      );
    }

    const sigCheck = sniffMediaSignature(
      buf,
      classified.kind,
      classified.contentType
    );
    if (!sigCheck.valid) {
      return c.json(
        { error: sigCheck.reason || 'Uploaded file failed signature validation.' },
        400
      );
    }

    const key = buildStorageObjectKey(
      authUser.uid,
      folder,
      classified.extension,
      Date.now(),
      generateCryptoTokenHex(8)
    );
    const cacheControl = resolveStorageCacheControl(folder);
    const publicBase = resolveConfiguredR2PublicUrl(c.env);

    if (c.env.R2_BUCKET) {
      try {
        const existing = await c.env.R2_BUCKET.head(key);
        if (existing) {
          return c.json({ error: 'Object key conflict; please retry upload.' }, 409);
        }
        await c.env.R2_BUCKET.put(key, buf, {
          httpMetadata: {
            contentType: classified.contentType,
            cacheControl,
          },
          customMetadata: {
            uploader_uid: authUser.uid,
            media_kind: classified.kind,
          },
        });
        const url = resolveStoragePublicUrl(key, publicBase);
        return c.json(
          {
            ok: true,
            provider: 'cloudflare-r2',
            key,
            url,
            kind: classified.kind,
            contentType: classified.contentType,
            size: buf.byteLength,
          },
          201
        );
      } catch (err) {
        const info = classifyR2BackendError(err);
        console.warn(`[worker/storage/upload] ${info.code}: ${info.message}`);
        return c.json({ code: info.code, error: info.message }, info.status as 502);
      }
    }

    const s3 = await createS3FallbackClient(c.env);
    if (!s3) {
      return c.json(
        {
          code: 'R2_NOT_CONFIGURED',
          error: 'Cloudflare R2 storage is not configured on this runtime.',
        },
        503
      );
    }

    try {
      await s3.client.send(
        new s3.PutObjectCommand({
          Bucket: s3.config.bucketName,
          Key: key,
          Body: buf,
          ContentType: classified.contentType,
          ContentLength: buf.byteLength,
          CacheControl: cacheControl,
          Metadata: {
            uploader_uid: authUser.uid,
            media_kind: classified.kind,
          },
        })
      );
      const url = resolveStoragePublicUrl(key, s3.config.publicUrl);
      return c.json(
        {
          ok: true,
          provider: 'cloudflare-r2',
          key,
          url,
          kind: classified.kind,
          contentType: classified.contentType,
          size: buf.byteLength,
        },
        201
      );
    } catch (err) {
      const info = classifyR2BackendError(err);
      console.warn(`[s3/storage/upload] ${info.code}: ${info.message}`);
      return c.json({ code: info.code, error: info.message }, info.status as 502);
    }
  };

  app.post('/api/storage/upload', requireVerifiedAuth, handleStorageUpload);
  app.put('/api/storage/upload', requireVerifiedAuth, handleStorageUpload);

  app.post('/api/storage/presign', requireVerifiedAuth, async (c) => {
    const authUser = c.get('authUser');
    const rate = rateLimiter.check(`presign:${authUser.uid}`, 30, 60_000);
    if (!rate.allowed) {
      return c.json({ error: 'Presign rate limit exceeded.' }, 429);
    }

    const s3 = await createS3FallbackClient(c.env);
    if (!s3) {
      return c.json(
        {
          code: 'USE_DIRECT_UPLOAD',
          directUploadUrl: '/api/storage/upload',
          error: 'Presigned URLs require S3 API keys; use direct /api/storage/upload.',
        },
        409
      );
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      filename?: string;
      contentType?: string;
      size?: number;
      folder?: string;
    };

    const classified = classifyUploadMime(body.contentType || '', body.filename || '');
    if (
      !classified.valid ||
      !classified.kind ||
      !classified.contentType ||
      !classified.extension ||
      !classified.maxBytes
    ) {
      return c.json({ error: classified.error || 'Unsupported file type.' }, 400);
    }

    if (
      typeof body.size !== 'number' ||
      !Number.isFinite(body.size) ||
      body.size <= 0
    ) {
      return c.json({ error: 'Exact non-zero file size is required.' }, 400);
    }
    if (body.size > classified.maxBytes) {
      const maxMb = Math.round(classified.maxBytes / (1024 * 1024));
      return c.json(
        { error: `File exceeds the ${maxMb} MB limit for ${classified.kind} uploads.` },
        413
      );
    }

    const folder = normalizeStorageFolder(body.folder);
    const key = buildStorageObjectKey(
      authUser.uid,
      folder,
      classified.extension,
      Date.now(),
      generateCryptoTokenHex(8)
    );
    const cacheControl = resolveStorageCacheControl(folder);
    const jti = generateCryptoTokenHex(12);
    const expiresIn = 120;

    try {
      const cmd = new s3.PutObjectCommand({
        Bucket: s3.config.bucketName,
        Key: key,
        ContentType: classified.contentType,
        ContentLength: Math.floor(body.size),
        CacheControl: cacheControl,
      });
      const uploadUrl = await s3.getSignedUrl(s3.client, cmd, { expiresIn });
      const hmacSecret = await deriveHmacSecret(c.env, 'r2-upload');
      const completeToken = await signScopedHmacToken<UploadTicketPayload>(
        {
          kind: 'r2-upload',
          uid: authUser.uid,
          key,
          contentType: classified.contentType,
          expectedSize: Math.floor(body.size),
          maxBytes: classified.maxBytes,
          jti,
          exp: Math.floor(Date.now() / 1000) + expiresIn + 60,
        },
        hmacSecret
      );

      return c.json({
        ok: true,
        provider: 'cloudflare-r2',
        key,
        uploadUrl,
        completeToken,
        publicUrl: resolveStoragePublicUrl(key, s3.config.publicUrl),
        expiresIn,
      });
    } catch (err) {
      const info = classifyR2BackendError(err);
      return c.json({ code: info.code, error: info.message }, info.status as 502);
    }
  });

  app.post('/api/storage/complete', requireVerifiedAuth, async (c) => {
    const authUser = c.get('authUser');
    const body = (await c.req.json().catch(() => ({}))) as {
      completeToken?: string;
    };
    if (!body.completeToken || typeof body.completeToken !== 'string') {
      return c.json({ error: 'Missing completeToken.' }, 400);
    }

    const hmacSecret = await deriveHmacSecret(c.env, 'r2-upload');
    const ticket = await verifyScopedHmacToken<UploadTicketPayload>(
      body.completeToken,
      hmacSecret
    );
    if (!ticket || ticket.kind !== 'r2-upload' || ticket.uid !== authUser.uid) {
      return c.json({ error: 'Invalid or expired upload completion token.' }, 403);
    }
    if (consumedUploadTickets.has(ticket.jti)) {
      return c.json({ error: 'Upload ticket has already been consumed.' }, 409);
    }
    consumedUploadTickets.set(ticket.jti, Date.now() + 600_000);

    const s3 = await createS3FallbackClient(c.env);
    if (!s3) {
      return c.json({ error: 'Storage backend unavailable.' }, 503);
    }

    try {
      const head = await s3.client.send(
        new s3.HeadObjectCommand({ Bucket: s3.config.bucketName, Key: ticket.key })
      );
      const actualSize = Number(head.ContentLength || 0);
      if (actualSize <= 0 || actualSize > ticket.maxBytes || actualSize !== ticket.expectedSize) {
        await s3.client.send(
          new s3.DeleteObjectCommand({ Bucket: s3.config.bucketName, Key: ticket.key })
        ).catch(() => {});
        return c.json({ error: 'Uploaded object size validation failed.' }, 400);
      }

      const sliceObj = await s3.client.send(
        new s3.GetObjectCommand({
          Bucket: s3.config.bucketName,
          Key: ticket.key,
          Range: 'bytes=0-255',
        })
      );
      const headBytes = sliceObj.Body
        ? new Uint8Array(await sliceObj.Body.transformToByteArray())
        : new Uint8Array(0);
      const classified = classifyUploadMime(ticket.contentType, ticket.key);
      if (
        !classified.valid ||
        !classified.kind ||
        !sniffMediaSignature(headBytes, classified.kind, ticket.contentType).valid
      ) {
        await s3.client.send(
          new s3.DeleteObjectCommand({ Bucket: s3.config.bucketName, Key: ticket.key })
        ).catch(() => {});
        return c.json({ error: 'Uploaded object failed file signature check.' }, 400);
      }

      return c.json({
        ok: true,
        key: ticket.key,
        url: resolveStoragePublicUrl(ticket.key, s3.config.publicUrl),
        size: actualSize,
        contentType: ticket.contentType,
      });
    } catch (err) {
      const info = classifyR2BackendError(err);
      return c.json({ code: info.code, error: info.message }, info.status as 502);
    }
  });

  const handleGetStorageFile = async (
    c: Context<{ Bindings: WorkerEnv; Variables: AppVariables }>
  ) => {
    const pathname = new URL(c.req.url).pathname;
    let rawKey = '';
    if (pathname.startsWith('/api/storage/file/')) {
      rawKey = decodeURIComponent(pathname.slice('/api/storage/file/'.length));
    } else {
      rawKey = c.req.query('key') || '';
    }

    if (!isValidStorageObjectKey(rawKey)) {
      return c.json({ error: 'Invalid storage object key.' }, 400);
    }

    const rangeHeader = c.req.header('range');
    const cacheControl = resolveStorageCacheControl(rawKey);

    if (c.env.R2_BUCKET) {
      try {
        const head = await c.env.R2_BUCKET.head(rawKey);
        if (!head) {
          return c.json({ error: 'Media object not found.' }, 404);
        }

        const parsedRange = parseHttpRangeHeader(rangeHeader, head.size);
        if (parsedRange.kind === 'invalid') {
          return new Response(null, {
            status: 416,
            headers: {
              'Content-Range': `bytes */${head.size}`,
              'X-Content-Type-Options': 'nosniff',
            },
          });
        }

        const r2Obj =
          parsedRange.kind === 'valid'
            ? await c.env.R2_BUCKET.get(rawKey, {
                range: {
                  offset: parsedRange.start,
                  length: parsedRange.length,
                },
              })
            : await c.env.R2_BUCKET.get(rawKey);

        if (!r2Obj || !r2Obj.body) {
          return c.json({ error: 'Media object not found.' }, 404);
        }

        const headers = new Headers();
        if (r2Obj.httpMetadata?.contentType) {
          headers.set('Content-Type', r2Obj.httpMetadata.contentType);
        }
        headers.set('Accept-Ranges', 'bytes');
        headers.set('Cache-Control', cacheControl);
        headers.set('X-Content-Type-Options', 'nosniff');
        if (r2Obj.httpEtag) {
          headers.set('ETag', r2Obj.httpEtag);
        }

        if (parsedRange.kind === 'valid') {
          headers.set('Content-Range', parsedRange.contentRange);
          headers.set('Content-Length', String(parsedRange.length));
          return new Response(r2Obj.body as unknown as ReadableStream, {
            status: 206,
            headers,
          });
        }

        headers.set('Content-Length', String(r2Obj.size));
        return new Response(r2Obj.body as unknown as ReadableStream, {
          status: 200,
          headers,
        });
      } catch (err) {
        const info = classifyR2BackendError(err);
        return c.json({ code: info.code, error: info.message }, info.status as 502);
      }
    }

    const s3 = await createS3FallbackClient(c.env);
    if (!s3) {
      return c.json(
        { code: 'R2_NOT_CONFIGURED', error: 'Cloudflare R2 storage is not configured.' },
        503
      );
    }

    try {
      const head = await s3.client.send(
        new s3.HeadObjectCommand({ Bucket: s3.config.bucketName, Key: rawKey })
      );
      const totalSize = Number(head.ContentLength || 0);
      const parsedRange = parseHttpRangeHeader(rangeHeader, totalSize);
      if (parsedRange.kind === 'invalid') {
        return new Response(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${totalSize}`,
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }

      const obj = await s3.client.send(
        new s3.GetObjectCommand({
          Bucket: s3.config.bucketName,
          Key: rawKey,
          Range:
            parsedRange.kind === 'valid'
              ? `bytes=${parsedRange.start}-${parsedRange.end}`
              : undefined,
        })
      );
      if (!obj.Body) {
        return c.json({ error: 'Media object not found.' }, 404);
      }

      const headers = new Headers();
      if (obj.ContentType) headers.set('Content-Type', obj.ContentType);
      if (typeof obj.ContentLength === 'number') {
        headers.set('Content-Length', String(obj.ContentLength));
      }
      if (obj.ContentRange) headers.set('Content-Range', obj.ContentRange);
      if (obj.ETag) headers.set('ETag', obj.ETag);
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Cache-Control', cacheControl);
      headers.set('X-Content-Type-Options', 'nosniff');

      const stream = obj.Body.transformToWebStream();
      return new Response(stream, {
        status: obj.ContentRange ? 206 : 200,
        headers,
      });
    } catch (err) {
      const name =
        err && typeof err === 'object' && 'name' in err
          ? String((err as { name?: string }).name)
          : '';
      if (name === 'NoSuchKey' || name === 'NotFound') {
        return c.json({ error: 'Media object not found.' }, 404);
      }
      const info = classifyR2BackendError(err);
      return c.json({ code: info.code, error: info.message }, info.status as 502);
    }
  };

  app.get('/api/storage/file', handleGetStorageFile);
  app.get('/api/storage/file/*', handleGetStorageFile);

  app.get('/api/storage/list', requireVerifiedAuth, async (c) => {
    const authUser = c.get('authUser');
    const prefix = `uploads/${authUser.uid}/`;
    const publicBase = resolveConfiguredR2PublicUrl(c.env);

    if (c.env.R2_BUCKET) {
      try {
        const listed = await c.env.R2_BUCKET.list({ prefix, limit: 50 });
        return c.json({
          ok: true,
          provider: 'cloudflare-r2',
          items: listed.objects.map((item) => ({
            key: item.key,
            url: resolveStoragePublicUrl(item.key, publicBase),
            size: item.size,
            lastModified: item.uploaded.toISOString(),
          })),
        });
      } catch (err) {
        const info = classifyR2BackendError(err);
        return c.json({ code: info.code, error: info.message }, info.status as 502);
      }
    }

    const s3 = await createS3FallbackClient(c.env);
    if (!s3) {
      return c.json({ code: 'R2_NOT_CONFIGURED', error: 'R2 storage not configured.' }, 503);
    }

    try {
      const listed = await s3.client.send(
        new s3.ListObjectsV2Command({
          Bucket: s3.config.bucketName,
          Prefix: prefix,
          MaxKeys: 50,
        })
      );
      return c.json({
        ok: true,
        provider: 'cloudflare-r2',
        items: (listed.Contents || [])
          .filter((item): item is typeof item & { Key: string } => Boolean(item.Key))
          .map((item) => ({
            key: item.Key,
            url: resolveStoragePublicUrl(item.Key, s3.config.publicUrl),
            size: Number(item.Size || 0),
            lastModified: item.LastModified?.toISOString() || null,
          })),
      });
    } catch (err) {
      const info = classifyR2BackendError(err);
      return c.json({ code: info.code, error: info.message }, info.status as 502);
    }
  });

  app.delete('/api/storage/file', requireVerifiedAuth, async (c) => {
    const authUser = c.get('authUser');
    const body = (await c.req.json().catch(() => ({}))) as { key?: unknown };
    const key =
      (c.req.query('key') || (typeof body.key === 'string' ? body.key : '')).trim();

    if (!isValidStorageObjectKey(key)) {
      return c.json({ error: 'Invalid storage object key.' }, 400);
    }
    if (!isOwnedStorageKey(authUser.uid, key)) {
      return c.json({ error: 'Forbidden: you can only delete your own files.' }, 403);
    }

    if (c.env.R2_BUCKET) {
      try {
        const existing = await c.env.R2_BUCKET.head(key);
        if (!existing) {
          return c.json({ error: 'Media object not found.' }, 404);
        }
        await c.env.R2_BUCKET.delete(key);
        return c.json({ ok: true, deletedKey: key });
      } catch (err) {
        const info = classifyR2BackendError(err);
        return c.json({ code: info.code, error: info.message }, info.status as 502);
      }
    }

    const s3 = await createS3FallbackClient(c.env);
    if (!s3) {
      return c.json({ code: 'R2_NOT_CONFIGURED', error: 'R2 storage not configured.' }, 503);
    }

    try {
      await s3.client.send(
        new s3.HeadObjectCommand({ Bucket: s3.config.bucketName, Key: key })
      );
      await s3.client.send(
        new s3.DeleteObjectCommand({ Bucket: s3.config.bucketName, Key: key })
      );
      return c.json({ ok: true, deletedKey: key });
    } catch (err) {
      const name =
        err && typeof err === 'object' && 'name' in err
          ? String((err as { name?: string }).name)
          : '';
      if (name === 'NoSuchKey' || name === 'NotFound') {
        return c.json({ error: 'Media object not found.' }, 404);
      }
      const info = classifyR2BackendError(err);
      return c.json({ code: info.code, error: info.message }, info.status as 502);
    }
  });

  // --- Administrator Cloudflare R2 Storage Governance Endpoints ---
  const ADMIN_ALLOWLIST_EMAILS = new Set([
    'prigidwebcloud@gmail.com',
    'prigidholdings@gmail.com',
  ]);

  const verifyAdminRequest = async (
    c: Context<{ Bindings: WorkerEnv; Variables: AppVariables }>
  ): Promise<boolean> => {
    const authUser = c.get('authUser');
    if (!authUser || !authUser.emailVerified) return false;
    const email = (authUser.email || '').trim().toLowerCase();
    if (ADMIN_ALLOWLIST_EMAILS.has(email)) {
      return true;
    }

    const fb = getFirebaseSettings(c.env);
    const token = c.get('authToken');
    if (!fb.projectId || !token) return false;

    try {
      const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        fb.projectId
      )}/databases/${encodeURIComponent(fb.databaseId)}/documents/admins/${encodeURIComponent(
        authUser.uid
      )}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const parseR2KeySegments = (key: string) => {
    const parts = key.split('/').filter(Boolean);
    return {
      ownerUid: parts[0] === 'uploads' && parts[1] ? parts[1] : 'unknown',
      folder: parts[0] === 'uploads' && parts[2] ? parts[2] : 'root',
    };
  };

  app.get('/api/admin/storage/list', requireVerifiedAuth, async (c) => {
    const isAdmin = await verifyAdminRequest(c);
    if (!isAdmin) {
      return c.json({ error: 'Forbidden: administrator access required.' }, 403);
    }

    const rawPrefix = (c.req.query('prefix') || 'uploads/').trim();
    const prefix = rawPrefix === 'all' ? '' : rawPrefix.replace(/^\/+/, '');
    const publicBase = resolveConfiguredR2PublicUrl(c.env);

    if (c.env.R2_BUCKET) {
      try {
        const listed = await c.env.R2_BUCKET.list({
          prefix: prefix || undefined,
          limit: 200,
        });
        const items = listed.objects.map((item) => {
          const meta = parseR2KeySegments(item.key);
          return {
            key: item.key,
            url: resolveStoragePublicUrl(item.key, publicBase),
            size: item.size,
            ownerUid: meta.ownerUid,
            folder: meta.folder,
            lastModified: item.uploaded.toISOString(),
          };
        });
        const totalBytes = items.reduce((sum, i) => sum + i.size, 0);
        return c.json({
          ok: true,
          provider: 'cloudflare-r2',
          items,
          totalCount: items.length,
          totalBytes,
        });
      } catch (err) {
        const info = classifyR2BackendError(err);
        return c.json({ code: info.code, error: info.message }, info.status as 502);
      }
    }

    const s3 = await createS3FallbackClient(c.env);
    if (!s3) {
      return c.json(
        { code: 'R2_NOT_CONFIGURED', error: 'R2 storage not configured.' },
        503
      );
    }

    try {
      const listed = await s3.client.send(
        new s3.ListObjectsV2Command({
          Bucket: s3.config.bucketName,
          Prefix: prefix || undefined,
          MaxKeys: 200,
        })
      );
      const items = (listed.Contents || [])
        .filter((item): item is typeof item & { Key: string } => Boolean(item.Key))
        .map((item) => {
          const meta = parseR2KeySegments(item.Key);
          return {
            key: item.Key,
            url: resolveStoragePublicUrl(item.Key, s3.config.publicUrl),
            size: Number(item.Size || 0),
            ownerUid: meta.ownerUid,
            folder: meta.folder,
            lastModified: item.LastModified?.toISOString() || null,
          };
        });
      const totalBytes = items.reduce((sum, i) => sum + i.size, 0);
      return c.json({
        ok: true,
        provider: 'cloudflare-r2',
        items,
        totalCount: items.length,
        totalBytes,
      });
    } catch (err) {
      const info = classifyR2BackendError(err);
      return c.json({ code: info.code, error: info.message }, info.status as 502);
    }
  });

  app.delete('/api/admin/storage/file', requireVerifiedAuth, async (c) => {
    const isAdmin = await verifyAdminRequest(c);
    if (!isAdmin) {
      return c.json({ error: 'Forbidden: administrator access required.' }, 403);
    }

    const body = (await c.req.json().catch(() => ({}))) as { key?: unknown };
    const key = (
      c.req.query('key') || (typeof body.key === 'string' ? body.key : '')
    ).trim();

    if (!isValidStorageObjectKey(key)) {
      return c.json({ error: 'Invalid storage object key.' }, 400);
    }

    if (c.env.R2_BUCKET) {
      try {
        const existing = await c.env.R2_BUCKET.head(key);
        if (!existing) {
          return c.json({ error: 'Media object not found.' }, 404);
        }
        await c.env.R2_BUCKET.delete(key);
        return c.json({ ok: true, deletedKey: key });
      } catch (err) {
        const info = classifyR2BackendError(err);
        return c.json({ code: info.code, error: info.message }, info.status as 502);
      }
    }

    const s3 = await createS3FallbackClient(c.env);
    if (!s3) {
      return c.json(
        { code: 'R2_NOT_CONFIGURED', error: 'R2 storage not configured.' },
        503
      );
    }

    try {
      await s3.client.send(
        new s3.HeadObjectCommand({ Bucket: s3.config.bucketName, Key: key })
      );
      await s3.client.send(
        new s3.DeleteObjectCommand({ Bucket: s3.config.bucketName, Key: key })
      );
      return c.json({ ok: true, deletedKey: key });
    } catch (err) {
      const name =
        err && typeof err === 'object' && 'name' in err
          ? String((err as { name?: string }).name)
          : '';
      if (name === 'NoSuchKey' || name === 'NotFound') {
        return c.json({ error: 'Media object not found.' }, 404);
      }
      const info = classifyR2BackendError(err);
      return c.json({ code: info.code, error: info.message }, info.status as 502);
    }
  });

  // --- Cloudflare Calls / WebRTC SFU Endpoints (Protected & Scoped) ---
  app.get('/api/calls/status', (c) => {
    const parsed = parseCallsConfig(c.env);
    const turnKeyStatus = parseTurnKeyConfig(c.env);
    const staticIce = parseIceServersConfig(c.env);
    return c.json({
      provider: 'cloudflare-calls',
      configured: parsed.configured,
      hasTurnConfigured: turnKeyStatus.configured || staticIce.hasTurnConfigured,
    });
  });

  app.get('/api/calls/ice-servers', requireVerifiedAuth, async (c) => {
    try {
      const ice = await resolveCallsIceServers({ env: c.env });
      return c.json({
        iceServers: ice.iceServers,
        hasTurnConfigured: ice.hasTurnConfigured,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to generate TURN ICE server credentials.';
      console.error('Failed to resolve ICE servers:', message);
      return c.json({ error: message }, 502);
    }
  });

  app.post('/api/calls/sessions/new', requireVerifiedAuth, async (c) => {
    const authUser = c.get('authUser');
    const authToken = c.get('authToken');
    const rate = rateLimiter.check(`calls:new:${authUser.uid}`, 20, 60_000);
    if (!rate.allowed) {
      return c.json({ error: 'Call session creation rate limit exceeded.' }, 429);
    }

    const parsed = parseCallsConfig(c.env);
    if (!parsed.configured || !parsed.config) {
      return c.json(
        {
          error:
            'Cloudflare Calls is not configured. Configure CLOUDFLARE_CALLS_APP_ID and CLOUDFLARE_CALLS_APP_TOKEN.',
        },
        503
      );
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      callId?: unknown;
      idempotencyKey?: unknown;
    };
    const callId = typeof body.callId === 'string' ? body.callId.trim() : '';
    if (!isValidCallRoomId(callId)) {
      return c.json({ error: 'Valid callId is required to create a call session.' }, 400);
    }

    const membership = await verifyCallRoomMembership(
      c.env,
      callId,
      authUser.uid,
      authToken
    );
    if (!membership.allowed) {
      return c.json(
        { error: membership.error || 'Forbidden.' },
        membership.status as 403
      );
    }

    const idemSuffix =
      typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
        ? body.idempotencyKey.trim().slice(0, 64)
        : '';
    const dedupeKey = `${authUser.uid}:${callId}:${idemSuffix}`;
    const existing = recentCallSessionCache.get(dedupeKey);
    const nowMs = Date.now();

    if (idemSuffix && existing && existing.expiresAtMs > nowMs) {
      const cachedIceCheck = validateIceServersConfig(existing.iceServers);
      if (existing.iceExpiresAtMs > nowMs && cachedIceCheck.valid) {
        return c.json(
          {
            sessionId: existing.sessionId,
            sessionToken: existing.sessionToken,
            callId,
            iceServers: cachedIceCheck.iceServers,
            hasTurnConfigured: existing.hasTurnConfigured,
          },
          200
        );
      }

      try {
        const refreshedIce = await resolveCallsIceServers({ env: c.env });
        recentCallSessionCache.set(dedupeKey, {
          ...existing,
          iceServers: refreshedIce.iceServers,
          hasTurnConfigured: refreshedIce.hasTurnConfigured,
          iceExpiresAtMs: Date.now() + 30_000,
        });
        return c.json(
          {
            sessionId: existing.sessionId,
            sessionToken: existing.sessionToken,
            callId,
            iceServers: refreshedIce.iceServers,
            hasTurnConfigured: refreshedIce.hasTurnConfigured,
          },
          200
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to generate TURN ICE server credentials.';
        console.error('Failed to refresh TURN credentials for cached call session:', message);
        return c.json({ error: message }, 502);
      }
    }

    let ice: { iceServers: RTCIceServer[]; hasTurnConfigured: boolean };
    try {
      ice = await resolveCallsIceServers({ env: c.env });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to generate TURN ICE server credentials.';
      console.error('Failed to resolve TURN credentials for new call session:', message);
      return c.json({ error: message }, 502);
    }

    try {
      const cfUrl = buildCloudflareCallsUrl(parsed.config.appId, 'sessions/new');
      const cfRes = await fetch(cfUrl, {
        method: 'POST',
        headers: formatCallsHeaders(parsed.config.appToken),
      });

      const data = await readUpstreamJson(cfRes);
      if (!cfRes.ok || typeof data.sessionId !== 'string') {
        const message = extractCallsErrorMessage(data, cfRes.status);
        return c.json({ ...data, error: message }, (cfRes.status || 502) as 502);
      }

      const secret = await deriveHmacSecret(c.env, 'calls-session');
      const sessionToken = await signScopedHmacToken<CallsSessionBindingPayload>(
        {
          kind: 'calls-session',
          uid: authUser.uid,
          callId,
          cfSessionId: data.sessionId,
          exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        },
        secret
      );

      if (idemSuffix) {
        const cacheUntil = Date.now() + 30_000;
        recentCallSessionCache.set(dedupeKey, {
          sessionId: data.sessionId,
          sessionToken,
          iceServers: ice.iceServers,
          hasTurnConfigured: ice.hasTurnConfigured,
          iceExpiresAtMs: cacheUntil,
          expiresAtMs: cacheUntil,
        });
      }

      return c.json(
        {
          ...data,
          sessionToken,
          callId,
          iceServers: ice.iceServers,
          hasTurnConfigured: ice.hasTurnConfigured,
        },
        201
      );
    } catch (err) {
      console.error('Failed to create Cloudflare Calls session:', err);
      return c.json({ error: 'Failed to create Cloudflare Calls session.' }, 502);
    }
  });

  const verifyCallsSessionBinding = async (
    c: Context<{ Bindings: WorkerEnv; Variables: AppVariables }>,
    sessionId: string
  ): Promise<{ ok: true; payload: CallsSessionBindingPayload } | { ok: false; response: Response }> => {
    const authUser = c.get('authUser');
    if (!isValidCallsSessionId(sessionId)) {
      return {
        ok: false,
        response: c.json({ error: 'Invalid sessionId.' }, 400),
      };
    }

    const sessionToken =
      c.req.header('x-call-session-token') || c.req.query('sessionToken') || '';
    if (!sessionToken) {
      return {
        ok: false,
        response: c.json({ error: 'Missing X-Call-Session-Token header.' }, 403),
      };
    }

    const secret = await deriveHmacSecret(c.env, 'calls-session');
    const verified = await verifyScopedHmacToken<CallsSessionBindingPayload>(
      sessionToken,
      secret
    );
    if (
      !verified ||
      verified.kind !== 'calls-session' ||
      verified.uid !== authUser.uid ||
      verified.cfSessionId !== sessionId
    ) {
      return {
        ok: false,
        response: c.json(
          { error: 'Forbidden: sessionId does not belong to your authenticated call session.' },
          403
        ),
      };
    }

    return { ok: true, payload: verified };
  };

  app.get('/api/calls/sessions/:sessionId', requireVerifiedAuth, async (c) => {
    const sessionId = (c.req.param('sessionId') || '').trim();
    const binding = await verifyCallsSessionBinding(c, sessionId);
    if (!binding.ok) return binding.response;

    const parsed = parseCallsConfig(c.env);
    if (!parsed.configured || !parsed.config) {
      return c.json({ error: 'Cloudflare Calls is not configured.' }, 503);
    }

    try {
      const cfUrl = buildCloudflareCallsUrl(
        parsed.config.appId,
        `sessions/${encodeURIComponent(sessionId)}`
      );
      const cfRes = await fetch(cfUrl, {
        method: 'GET',
        headers: formatCallsHeaders(parsed.config.appToken),
      });
      const data = await readUpstreamJson(cfRes);
      if (!cfRes.ok) {
        return c.json(
          { ...data, error: extractCallsErrorMessage(data, cfRes.status) },
          cfRes.status as 400
        );
      }
      return c.json(data, cfRes.status as 200);
    } catch {
      return c.json({ error: 'Failed to query Cloudflare Calls session.' }, 502);
    }
  });

  app.post('/api/calls/sessions/:sessionId/tracks/new', requireVerifiedAuth, async (c) => {
    const authUser = c.get('authUser');
    const rate = rateLimiter.check(`calls:signal:${authUser.uid}`, 120, 60_000);
    if (!rate.allowed) {
      return c.json({ error: 'Calls signaling rate limit exceeded.' }, 429);
    }

    const sessionId = (c.req.param('sessionId') || '').trim();
    const binding = await verifyCallsSessionBinding(c, sessionId);
    if (!binding.ok) return binding.response;

    const parsed = parseCallsConfig(c.env);
    if (!parsed.configured || !parsed.config) {
      return c.json({ error: 'Cloudflare Calls is not configured.' }, 503);
    }

    const body = await c.req.json().catch(() => null);
    const check = validateCallsTracksPayload(body);
    if (!check.valid) {
      return c.json({ error: check.error || 'Invalid track payload.' }, 400);
    }

    try {
      const cfUrl = buildCloudflareCallsUrl(
        parsed.config.appId,
        `sessions/${encodeURIComponent(sessionId)}/tracks/new`
      );
      const cfRes = await fetch(cfUrl, {
        method: 'POST',
        headers: formatCallsHeaders(parsed.config.appToken),
        body: JSON.stringify(body),
      });
      const data = await readUpstreamJson(cfRes);
      if (!cfRes.ok) {
        return c.json(
          { ...data, error: extractCallsErrorMessage(data, cfRes.status) },
          cfRes.status as 400
        );
      }
      return c.json(data, cfRes.status as 200);
    } catch {
      return c.json({ error: 'Failed to negotiate tracks with Cloudflare Calls.' }, 502);
    }
  });

  app.put('/api/calls/sessions/:sessionId/renegotiate', requireVerifiedAuth, async (c) => {
    const authUser = c.get('authUser');
    const rate = rateLimiter.check(`calls:signal:${authUser.uid}`, 120, 60_000);
    if (!rate.allowed) {
      return c.json({ error: 'Calls signaling rate limit exceeded.' }, 429);
    }

    const sessionId = (c.req.param('sessionId') || '').trim();
    const binding = await verifyCallsSessionBinding(c, sessionId);
    if (!binding.ok) return binding.response;

    const parsed = parseCallsConfig(c.env);
    if (!parsed.configured || !parsed.config) {
      return c.json({ error: 'Cloudflare Calls is not configured.' }, 503);
    }

    const body = await c.req.json().catch(() => null);
    const check = validateCallsRenegotiatePayload(body);
    if (!check.valid) {
      return c.json({ error: check.error || 'Invalid renegotiation payload.' }, 400);
    }

    try {
      const cfUrl = buildCloudflareCallsUrl(
        parsed.config.appId,
        `sessions/${encodeURIComponent(sessionId)}/renegotiate`
      );
      const cfRes = await fetch(cfUrl, {
        method: 'PUT',
        headers: formatCallsHeaders(parsed.config.appToken),
        body: JSON.stringify(body),
      });
      const data = await readUpstreamJson(cfRes);
      if (!cfRes.ok) {
        return c.json(
          { ...data, error: extractCallsErrorMessage(data, cfRes.status) },
          cfRes.status as 400
        );
      }
      return c.json(data, cfRes.status as 200);
    } catch {
      return c.json({ error: 'Failed to renegotiate Cloudflare Calls session.' }, 502);
    }
  });

  app.put('/api/calls/sessions/:sessionId/tracks/close', requireVerifiedAuth, async (c) => {
    const authUser = c.get('authUser');
    const rate = rateLimiter.check(`calls:signal:${authUser.uid}`, 120, 60_000);
    if (!rate.allowed) {
      return c.json({ error: 'Calls signaling rate limit exceeded.' }, 429);
    }

    const sessionId = (c.req.param('sessionId') || '').trim();
    const binding = await verifyCallsSessionBinding(c, sessionId);
    if (!binding.ok) return binding.response;

    const parsed = parseCallsConfig(c.env);
    if (!parsed.configured || !parsed.config) {
      return c.json({ error: 'Cloudflare Calls is not configured.' }, 503);
    }

    const body = await c.req.json().catch(() => null);
    const check = validateCallsClosePayload(body);
    if (!check.valid) {
      return c.json({ error: check.error || 'Invalid tracks close payload.' }, 400);
    }

    try {
      const cfUrl = buildCloudflareCallsUrl(
        parsed.config.appId,
        `sessions/${encodeURIComponent(sessionId)}/tracks/close`
      );
      const cfRes = await fetch(cfUrl, {
        method: 'PUT',
        headers: formatCallsHeaders(parsed.config.appToken),
        body: JSON.stringify(body),
      });
      const data = await readUpstreamJson(cfRes);
      if (!cfRes.ok) {
        return c.json(
          { ...data, error: extractCallsErrorMessage(data, cfRes.status) },
          cfRes.status as 400
        );
      }
      return c.json(data, cfRes.status as 200);
    } catch {
      return c.json({ error: 'Failed to close tracks on Cloudflare Calls.' }, 502);
    }
  });

  // --- Marketplace & Ecommerce Reverse Proxy + Merchant SSO Endpoints ---
  type FirestoreDocFields = Record<string, { stringValue?: string; booleanValue?: boolean }>;

  async function readFirestoreDoc(
    env: WorkerEnv,
    collectionPath: string,
    docId: string,
    bearerToken: string
  ): Promise<{ ok: true; fields: FirestoreDocFields } | { ok: false; status: number }> {
    const fb = getFirebaseSettings(env);
    if (!fb.projectId) return { ok: false, status: 500 };
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      fb.projectId
    )}/databases/${encodeURIComponent(fb.databaseId)}/documents/${collectionPath}/${encodeURIComponent(
      docId
    )}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    if (!res.ok) {
      return { ok: false, status: res.status };
    }
    const json = (await res.json().catch(() => ({}))) as { fields?: FirestoreDocFields };
    return { ok: true, fields: json.fields || {} };
  }

  async function commitBusinessStoreLink(
    env: WorkerEnv,
    bpId: string,
    storeId: string,
    storeSlug: string,
    bearerToken: string
  ): Promise<boolean> {
    const fb = getFirebaseSettings(env);
    if (!fb.projectId) return false;
    const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      fb.projectId
    )}/databases/${encodeURIComponent(fb.databaseId)}/documents:commit`;
    const docName = `projects/${fb.projectId}/databases/${fb.databaseId}/documents/businessProfiles/${bpId}`;
    const res = await fetch(commitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: docName,
              fields: {
                commerceStoreId: { stringValue: storeId },
                commerceStoreSlug: { stringValue: storeSlug },
              },
            },
            updateMask: {
              fieldPaths: ['commerceStoreId', 'commerceStoreSlug'],
            },
            updateTransforms: [
              {
                fieldPath: 'updatedAt',
                setToServerValue: 'REQUEST_TIME',
              },
            ],
          },
        ],
      }),
    });
    return res.ok;
  }

  async function verifyBusinessMembershipServer(
    env: WorkerEnv,
    bpId: string,
    uid: string,
    bearerToken: string
  ): Promise<
    | {
        ok: true;
        role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
        bp: {
          slug: string;
          displayName: string;
          currency: string;
          ownerUid: string;
          commerceStoreId: string;
          commerceStoreSlug: string;
        };
      }
    | { ok: false; status: number; error: string }
  > {
    const bpDoc = await readFirestoreDoc(env, 'businessProfiles', bpId, bearerToken);
    if (!bpDoc.ok) {
      return {
        ok: false,
        status: bpDoc.status === 404 ? 404 : 403,
        error:
          bpDoc.status === 404
            ? 'Business Profile not found.'
            : 'Forbidden: unable to read Business Profile.',
      };
    }

    const bpFields = bpDoc.fields;
    const bpStatus = bpFields.status?.stringValue || 'ACTIVE';
    if (bpStatus !== 'ACTIVE') {
      return {
        ok: false,
        status: 403,
        error: 'Business Profile is not active.',
      };
    }

    const ownerUid = bpFields.ownerUid?.stringValue || '';
    const membershipDoc = await readFirestoreDoc(
      env,
      'businessMemberships',
      `${bpId}_${uid}`,
      bearerToken
    );

    let role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER' | null = null;
    if (membershipDoc.ok) {
      const mStatus = (membershipDoc.fields.status?.stringValue || '').toUpperCase();
      const mRole = (membershipDoc.fields.role?.stringValue || '').toUpperCase();
      if (
        mStatus === 'ACTIVE' &&
        (mRole === 'OWNER' || mRole === 'ADMIN' || mRole === 'EDITOR' || mRole === 'VIEWER')
      ) {
        role = mRole;
      }
    } else if (ownerUid && ownerUid === uid) {
      role = 'OWNER';
    }

    if (!role) {
      return {
        ok: false,
        status: 403,
        error: 'Forbidden: you do not have an active role on this Business Profile.',
      };
    }

    return {
      ok: true,
      role,
      bp: {
        slug: bpFields.slug?.stringValue || bpId,
        displayName: bpFields.displayName?.stringValue || 'Looma Business',
        currency: bpFields.currency?.stringValue || 'USD',
        ownerUid,
        commerceStoreId: bpFields.commerceStoreId?.stringValue || '',
        commerceStoreSlug: bpFields.commerceStoreSlug?.stringValue || '',
      },
    };
  }

  app.get('/api/commerce/status', (c) => {
    const cfg = parseCommerceConfig(c.env);
    return c.json({
      configured: Boolean(cfg.apiUrl),
      upstreamConfigured: Boolean(cfg.apiUrl),
      defaultStoreId: cfg.defaultStoreId || null,
      hasPublishableKey: Boolean(cfg.publishableKey),
      adminDashboardUrl: cfg.adminDashboardUrl || null,
      ssoConfigured: Boolean(cfg.apiUrl && cfg.internalSsoSecret),
    });
  });

  app.post('/api/business-profiles/:bpId/provision-store', requireVerifiedAuth, async (c) => {
    const authUser = c.get('authUser');
    const authToken = c.get('authToken');
    const bpId = (c.req.param('bpId') || '').trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(bpId)) {
      return c.json({ error: 'Invalid Business Profile ID.' }, 400);
    }

    const cfg = parseCommerceConfig(c.env);
    if (!cfg.apiUrl || !cfg.internalSsoSecret) {
      return c.json(
        {
          code: 'COMMERCE_SSO_UNCONFIGURED',
          error: 'Commerce provisioning is unavailable until COMMERCE_API_URL and COMMERCE_INTERNAL_SSO_SECRET are configured.',
        },
        503
      );
    }

    const verifiedMembership = await verifyBusinessMembershipServer(
      c.env,
      bpId,
      authUser.uid,
      authToken
    );
    if (!verifiedMembership.ok) {
      return c.json({ error: verifiedMembership.error }, verifiedMembership.status as 403);
    }

    if (verifiedMembership.role !== 'OWNER' && verifiedMembership.role !== 'ADMIN') {
      return c.json(
        { error: 'Only Business Profile owners or admins can provision a Commerce store.' },
        403
      );
    }

    if (verifiedMembership.bp.commerceStoreId) {
      return c.json({
        ok: true,
        storeId: verifiedMembership.bp.commerceStoreId,
        storeSlug: verifiedMembership.bp.commerceStoreSlug,
        alreadyProvisioned: true,
      });
    }

    try {
      const upstream = await fetch(`${cfg.apiUrl}/api/internal/stores/provision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Looma-Internal-Secret': cfg.internalSsoSecret,
        },
        body: JSON.stringify({
          businessProfileId: bpId,
          ownerFirebaseUid: verifiedMembership.bp.ownerUid || authUser.uid,
          ownerEmail: authUser.email || '',
          ownerName: verifiedMembership.bp.displayName || authUser.email || 'Merchant',
          slug: verifiedMembership.bp.slug,
          name: verifiedMembership.bp.displayName,
          currency: verifiedMembership.bp.currency || 'USD',
        }),
      });
      const data = (await upstream.json().catch(() => ({}))) as {
        storeId?: string;
        storeSlug?: string;
        alreadyProvisioned?: boolean;
        error?: string;
      };
      if (!upstream.ok || !data.storeId) {
        return c.json(
          { error: data.error || 'Commerce API failed to provision merchant store.' },
          (upstream.status || 502) as 502
        );
      }

      const linked = await commitBusinessStoreLink(
        c.env,
        bpId,
        data.storeId,
        data.storeSlug || verifiedMembership.bp.slug,
        authToken
      );
      if (!linked) {
        console.warn('[worker/provision-store] Failed to link commerceStoreId back to Firestore:', bpId);
      }

      return c.json(
        {
          ok: true,
          storeId: data.storeId,
          storeSlug: data.storeSlug || verifiedMembership.bp.slug,
          alreadyProvisioned: Boolean(data.alreadyProvisioned),
        },
        201
      );
    } catch (err) {
      console.error('[worker/provision-store] Upstream error:', err);
      return c.json({ error: 'Unable to reach Commerce store provisioning service.' }, 502);
    }
  });

  app.post('/api/commerce/sso/authorize', requireVerifiedAuth, async (c) => {
    const authUser = c.get('authUser');
    const authToken = c.get('authToken');
    const rate = rateLimiter.check(`sso_auth:${authUser.uid}`, 30, 60_000);
    if (!rate.allowed) {
      return c.json({ error: 'Too many SSO authorization attempts. Please wait a moment.' }, 429);
    }

    const body = (await c.req.json().catch(() => ({}))) as { businessProfileId?: unknown };
    const bpId = typeof body.businessProfileId === 'string' ? body.businessProfileId.trim() : '';
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(bpId)) {
      return c.json({ error: 'Valid businessProfileId is required.' }, 400);
    }

    const cfg = parseCommerceConfig(c.env);
    if (!cfg.apiUrl || !cfg.internalSsoSecret) {
      return c.json(
        {
          code: 'COMMERCE_SSO_UNCONFIGURED',
          error: 'Commerce SSO requires COMMERCE_API_URL and COMMERCE_INTERNAL_SSO_SECRET.',
        },
        503
      );
    }

    const verifiedMembership = await verifyBusinessMembershipServer(
      c.env,
      bpId,
      authUser.uid,
      authToken
    );
    if (!verifiedMembership.ok) {
      return c.json({ error: verifiedMembership.error }, verifiedMembership.status as 403);
    }

    let storeId = verifiedMembership.bp.commerceStoreId;
    let storeSlug = verifiedMembership.bp.commerceStoreSlug;

    if (!storeId) {
      if (verifiedMembership.role !== 'OWNER' && verifiedMembership.role !== 'ADMIN') {
        return c.json(
          { error: 'Store has not been provisioned yet. Ask the Business Profile owner to initialize it.' },
          403
        );
      }

      const provRes = await fetch(`${cfg.apiUrl}/api/internal/stores/provision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Looma-Internal-Secret': cfg.internalSsoSecret,
        },
        body: JSON.stringify({
          businessProfileId: bpId,
          ownerFirebaseUid: verifiedMembership.bp.ownerUid || authUser.uid,
          ownerEmail: authUser.email || '',
          ownerName: verifiedMembership.bp.displayName,
          slug: verifiedMembership.bp.slug,
          name: verifiedMembership.bp.displayName,
          currency: verifiedMembership.bp.currency || 'USD',
        }),
      });
      const provData = (await provRes.json().catch(() => ({}))) as {
        storeId?: string;
        storeSlug?: string;
        error?: string;
      };
      if (!provRes.ok || !provData.storeId) {
        return c.json(
          { error: provData.error || 'Failed to provision Commerce store before SSO launch.' },
          502
        );
      }
      storeId = provData.storeId;
      storeSlug = provData.storeSlug || verifiedMembership.bp.slug;
      await commitBusinessStoreLink(c.env, bpId, storeId, storeSlug, authToken);
    }

    try {
      const issueRes = await fetch(`${cfg.apiUrl}/api/internal/sso/issue-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Looma-Internal-Secret': cfg.internalSsoSecret,
        },
        body: JSON.stringify({
          businessProfileId: bpId,
          firebaseUid: authUser.uid,
          email: authUser.email || '',
          displayName: (authUser.email || '').split('@')[0] || verifiedMembership.bp.displayName,
          role: verifiedMembership.role,
        }),
      });

      const issueData = (await issueRes.json().catch(() => ({}))) as {
        code?: string;
        storeId?: string;
        storeSlug?: string;
        error?: string;
      };
      if (!issueRes.ok || !issueData.code) {
        return c.json(
          { error: issueData.error || 'Commerce API denied SSO authorization code.' },
          (issueRes.status || 502) as 502
        );
      }

      return c.json({
        ok: true,
        storeId: issueData.storeId || storeId,
        storeSlug: issueData.storeSlug || storeSlug,
        redirectUrl: `/seller/sso?code=${encodeURIComponent(issueData.code)}`,
      });
    } catch (err) {
      console.error('[worker/commerce/sso/authorize] Upstream error:', err);
      return c.json({ error: 'Unable to reach Commerce SSO authorization endpoint.' }, 502);
    }
  });

  app.post('/api/commerce/sso/revoke', requireVerifiedAuth, async (c) => {
    const authUser = c.get('authUser');
    const authToken = c.get('authToken');
    const body = (await c.req.json().catch(() => ({}))) as {
      businessProfileId?: unknown;
      firebaseUid?: unknown;
      email?: unknown;
      nextRole?: unknown;
      removeMember?: unknown;
    };

    const bpId = typeof body.businessProfileId === 'string' ? body.businessProfileId.trim() : '';
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(bpId)) {
      return c.json({ error: 'Valid businessProfileId is required.' }, 400);
    }

    const verifiedMembership = await verifyBusinessMembershipServer(
      c.env,
      bpId,
      authUser.uid,
      authToken
    );
    if (!verifiedMembership.ok) {
      return c.json({ error: verifiedMembership.error }, verifiedMembership.status as 403);
    }

    if (verifiedMembership.role !== 'OWNER' && verifiedMembership.role !== 'ADMIN') {
      return c.json(
        { error: 'Only Business Profile owners or admins can revoke merchant sessions.' },
        403
      );
    }

    const cfg = parseCommerceConfig(c.env);
    if (!cfg.apiUrl || !cfg.internalSsoSecret) {
      return c.json({ ok: true, revoked: 0, skipped: true });
    }

    try {
      const upstream = await fetch(`${cfg.apiUrl}/api/internal/sessions/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Looma-Internal-Secret': cfg.internalSsoSecret,
        },
        body: JSON.stringify({
          businessProfileId: bpId,
          ...(typeof body.firebaseUid === 'string' && body.firebaseUid
            ? { firebaseUid: body.firebaseUid.trim() }
            : {}),
          ...(typeof body.email === 'string' && body.email
            ? { email: body.email.trim().toLowerCase() }
            : {}),
          ...(typeof body.nextRole === 'string' &&
          ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'].includes(body.nextRole.toUpperCase())
            ? { nextRole: body.nextRole.toUpperCase() }
            : {}),
          ...(typeof body.removeMember === 'boolean' ? { removeMember: body.removeMember } : {}),
        }),
      });
      const data = await upstream.json().catch(() => ({ ok: upstream.ok }));
      return c.json(data, upstream.status as 200);
    } catch (err) {
      console.error('[worker/commerce/sso/revoke] Upstream error:', err);
      return c.json({ error: 'Unable to reach Commerce session revocation service.' }, 502);
    }
  });

  const forwardCommerceRequest = async (
    c: Context<{ Bindings: WorkerEnv; Variables: AppVariables }>,
    mountPrefix: '/api/marketplace' | '/api/commerce' | '/api/commerce/admin' | '/api',
    options?: { attachAdminIdentity?: boolean; stripStoreOverride?: boolean }
  ): Promise<Response> => {
    const cfg = parseCommerceConfig(c.env);
    if (!cfg.apiUrl) {
      return c.json(
        {
          code: 'COMMERCE_PROXY_UNCONFIGURED',
          error:
            'External Commerce API URL (COMMERCE_API_URL) is not configured. Using Looma Marketplace Firestore mode.',
        },
        503
      );
    }

    const upstreamUrl = buildCommerceUpstreamUrl(cfg.apiUrl, mountPrefix, c.req.url, {
      stripStoreQuery: options?.stripStoreOverride,
    });
    const cleanReqHeaders = sanitizeProxyHeaders(c.req.raw.headers, {
      stripStoreOverride: options?.stripStoreOverride,
    });

    const forwardHeaders = new Headers();
    const tenantHeaders = resolveTenantForwardHeaders({
      reqHeaders: cleanReqHeaders,
      requestUrl: c.req.url,
      defaultStoreId: options?.stripStoreOverride ? '' : cfg.defaultStoreId,
      defaultPublishableKey: cfg.publishableKey,
      omitStoreHeaders: options?.stripStoreOverride,
    });
    for (const [key, value] of Object.entries(tenantHeaders)) {
      forwardHeaders.set(key, value);
    }

    const forwardHeaderAllowlist = [
      'content-type',
      'accept',
      'cookie',
      'x-idempotency-key',
      'stripe-signature',
      'x-paystack-signature',
      'verif-hash',
    ];
    for (const headerName of forwardHeaderAllowlist) {
      const val = cleanReqHeaders.get(headerName);
      if (val) {
        forwardHeaders.set(headerName, val);
      }
    }

    const authToken = c.get('authToken');
    const authUser = c.get('authUser');
    if (authToken) {
      forwardHeaders.set('Authorization', `Bearer ${authToken}`);
    } else {
      const incomingAuth = cleanReqHeaders.get('authorization');
      if (incomingAuth) {
        forwardHeaders.set('Authorization', incomingAuth);
      }
    }

    if (options?.attachAdminIdentity && authUser) {
      forwardHeaders.set('X-Looma-Verified-Uid', authUser.uid);
      if (authUser.email) {
        forwardHeaders.set('X-Looma-Verified-Email', authUser.email);
      }
    }

    const method = c.req.method.toUpperCase();
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const bodyBuffer = hasBody ? await c.req.arrayBuffer() : undefined;

    try {
      const upstreamRes = await fetch(upstreamUrl, {
        method,
        headers: forwardHeaders,
        body: bodyBuffer && bodyBuffer.byteLength > 0 ? bodyBuffer : undefined,
      });

      const responseHeaders = new Headers();
      const upstreamType = upstreamRes.headers.get('content-type');
      if (upstreamType) {
        responseHeaders.set('Content-Type', upstreamType);
      }
      const upstreamCookies =
        typeof (upstreamRes.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === 'function'
          ? (upstreamRes.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
          : [];
      if (upstreamCookies.length > 0) {
        for (const cookieVal of upstreamCookies) {
          responseHeaders.append('Set-Cookie', cookieVal);
        }
      } else {
        const singleSetCookie = upstreamRes.headers.get('set-cookie');
        if (singleSetCookie) {
          responseHeaders.append('Set-Cookie', singleSetCookie);
        }
      }

      responseHeaders.set('X-Content-Type-Options', 'nosniff');
      responseHeaders.set('Cache-Control', 'no-store');

      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: responseHeaders,
      });
    } catch (err) {
      console.error('[worker/commerce/proxy] Upstream request failed:', err);
      return c.json(
        {
          code: 'COMMERCE_UPSTREAM_UNREACHABLE',
          error: 'Unable to reach the configured Commerce API upstream server.',
        },
        502
      );
    }
  };

  app.all('/api/marketplace/*', async (c) => {
    const rateKey = getRateLimitClientKey(c);
    const rate = rateLimiter.check(`marketplace:${rateKey}`, 120, 60_000);
    if (!rate.allowed) {
      return c.json({ error: 'Marketplace rate limit exceeded.' }, 429);
    }
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      return requireVerifiedAuth(c, async () => {
        return;
      }).then((maybeDenied) => {
        if (maybeDenied instanceof Response) return maybeDenied;
        return forwardCommerceRequest(c, '/api/marketplace');
      });
    }
    return forwardCommerceRequest(c, '/api/marketplace');
  });

  app.all('/api/commerce/admin/*', async (c) => {
    const rate = rateLimiter.check(`commerce_admin:${getRateLimitClientKey(c)}`, 180, 60_000);
    if (!rate.allowed) {
      return c.json({ error: 'Commerce admin rate limit exceeded.' }, 429);
    }
    return forwardCommerceRequest(c, '/api/commerce/admin', {
      stripStoreOverride: true,
    });
  });

  app.all('/api/commerce/*', async (c) => {
    const subpath = c.req.path.replace(/^\/api\/commerce/, '') || '/';
    if (isBlockedPublicCommercePath(subpath)) {
      return c.json(
        {
          error:
            'Forbidden: administrative commerce endpoints must be accessed via the authenticated Merchant Portal.',
        },
        403
      );
    }

    if (requiresVerifiedBuyerAuth(c.req.method, subpath)) {
      let authorized = false;
      const maybeDenied = await requireVerifiedAuth(c, async () => {
        authorized = true;
      });
      if (!authorized) {
        return (
          maybeDenied ||
          c.json({ error: 'Authentication required for commerce actions.' }, 401)
        );
      }
    }

    const rate = rateLimiter.check(`commerce:${getRateLimitClientKey(c)}`, 120, 60_000);
    if (!rate.allowed) {
      return c.json({ error: 'Commerce API rate limit exceeded.' }, 429);
    }

    return forwardCommerceRequest(c, '/api/commerce');
  });

  // Server-side link metadata preview extractor for text + link posts
  const linkPreviewCache = new Map<string, { expiresAt: number; data: LinkPreviewMetadata }>();

  app.get('/api/link-preview', async (c) => {
    const rate = rateLimiter.check(`link_preview:${getRateLimitClientKey(c)}`, 60, 60_000);
    if (!rate.allowed) {
      return c.json({ error: 'Link preview rate limit exceeded.' }, 429);
    }

    const rawUrl = (c.req.query('url') || '').trim();
    const safety = isSafePublicPreviewUrl(rawUrl);
    if (!safety.valid || !safety.parsed) {
      return c.json({ error: safety.reason || 'Invalid or unsafe URL.' }, 400);
    }

    const canonicalUrl = safety.parsed.href;
    const cached = linkPreviewCache.get(canonicalUrl);
    if (cached && cached.expiresAt > Date.now()) {
      return c.json({ ok: true, preview: cached.data });
    }

    const saveCache = (data: LinkPreviewMetadata) => {
      if (linkPreviewCache.size >= 250) {
        const firstKey = linkPreviewCache.keys().next().value;
        if (firstKey) linkPreviewCache.delete(firstKey);
      }
      linkPreviewCache.set(canonicalUrl, {
        expiresAt: Date.now() + 15 * 60_000,
        data,
      });
    };

    try {
      const upstream = await fetch(canonicalUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(5000),
        headers: {
          Accept: 'text/html,application/xhtml+xml,image/*,video/*;q=0.8,*/*;q=0.5',
          'User-Agent': 'Mozilla/5.0 (compatible; LoomaLinkPreview/1.0)',
        },
      });

      const finalUrl = upstream.url || canonicalUrl;
      const finalCheck = isSafePublicPreviewUrl(finalUrl);
      if (!finalCheck.valid) {
        return c.json({ error: 'Redirect target is not a public URL.' }, 400);
      }

      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      if (contentType.startsWith('image/')) {
        const preview: LinkPreviewMetadata = {
          ...buildFallbackLinkPreview(finalUrl),
          url: canonicalUrl,
          finalUrl,
          imageUrl: finalUrl,
          mediaKind: 'image',
        };
        saveCache(preview);
        return c.json({ ok: true, preview });
      }
      if (contentType.startsWith('video/')) {
        const preview: LinkPreviewMetadata = {
          ...buildFallbackLinkPreview(finalUrl),
          url: canonicalUrl,
          finalUrl,
          videoUrl: finalUrl,
          mediaKind: 'video',
        };
        saveCache(preview);
        return c.json({ ok: true, preview });
      }

      if (!upstream.ok || (!contentType.includes('html') && !contentType.includes('xhtml'))) {
        const fallback = buildFallbackLinkPreview(canonicalUrl);
        saveCache(fallback);
        return c.json({ ok: true, preview: fallback });
      }

      const reader = upstream.body?.getReader();
      let html = '';
      if (reader) {
        const decoder = new TextDecoder();
        let totalBytes = 0;
        const maxBytes = 256 * 1024;
        while (totalBytes < maxBytes) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          totalBytes += value.byteLength;
          html += decoder.decode(value, { stream: true });
          if (/<\/head>/i.test(html)) break;
        }
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
      } else {
        html = (await upstream.text()).slice(0, 256 * 1024);
      }

      const extracted = extractLinkMetadataFromHtml(html, finalUrl);
      const preview: LinkPreviewMetadata = {
        ...extracted,
        url: canonicalUrl,
        finalUrl,
      };
      saveCache(preview);
      return c.json({ ok: true, preview });
    } catch {
      const fallback = buildFallbackLinkPreview(canonicalUrl);
      return c.json({ ok: true, preview: fallback });
    }
  });

  // Forward Commerce Seller Portal (/seller/) API traffic directly to Commerce API upstream
  app.all('/api/*', async (c, next) => {
    if (isCommerceSellerApiPath(c.req.path)) {
      const rate = rateLimiter.check(`seller_api:${getRateLimitClientKey(c)}`, 240, 60_000);
      if (!rate.allowed) {
        return c.json({ error: 'Seller API rate limit exceeded.' }, 429);
      }
      return forwardCommerceRequest(c, '/api', {
        stripStoreOverride: true,
      });
    }
    await next();
  });

  // Always return clean JSON 404 for unknown /api/* paths
  app.all('/api/*', (c) => {
    const ipKey = getRateLimitClientKey(c);
    void ipKey;
    return c.json(
      { error: `API route not found: ${c.req.method} ${c.req.path}` },
      404
    );
  });

  // Static Assets / SPA Fallback in Cloudflare Workers runtime
  app.all('*', async (c) => {
    if (c.env.ASSETS) {
      const url = new URL(c.req.url);
      const pathname = url.pathname;

      const fetchAssetHtml = async (assetPath: string): Promise<Response> => {
        const primary = (await c.env.ASSETS!.fetch(
          new Request(new URL(assetPath, url.origin), c.req.raw)
        )) as unknown as Response;
        if (primary.ok || assetPath === '/index.html') {
          return primary;
        }
        return c.env.ASSETS!.fetch(
          new Request(new URL('/index.html', url.origin), c.req.raw)
        ) as unknown as Response;
      };

      // Redirect /admin or /landingpage directory without trailing slash to preserve relative asset resolution
      if (pathname === '/admin') {
        return c.redirect(`/admin/${url.search}`, 301);
      }
      if (pathname === '/admin/') {
        return fetchAssetHtml('/admin/index.html');
      }
      if (pathname === '/seller') {
        return c.redirect(`/seller/${url.search}`, 301);
      }
      if (pathname === '/seller/') {
        return fetchAssetHtml('/seller/index.html');
      }
      if (pathname === '/landingpage' || pathname === '/landing') {
        return c.redirect(`/landingpage/${url.search}`, 301);
      }
      if (pathname === '/landingpage/') {
        return fetchAssetHtml('/landingpage/index.html');
      }

      const res = (await c.env.ASSETS.fetch(
        c.req.raw as unknown as Parameters<Fetcher['fetch']>[0]
      )) as unknown as Response;
      if (res.status === 404) {
        if (pathname.startsWith('/admin')) {
          return fetchAssetHtml('/admin/index.html');
        }
        if (pathname.startsWith('/seller')) {
          return fetchAssetHtml('/seller/index.html');
        }
        if (pathname.startsWith('/landingpage') || pathname.startsWith('/landing')) {
          return fetchAssetHtml('/landingpage/index.html');
        }
      }
      return res;
    }
    return c.text('Not found', 404);
  });

  return app;
}

const workerApp = createWorkerApp();

export default {
  fetch: workerApp.fetch,
};
