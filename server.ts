import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  buildStorageObjectKey,
  classifyR2BackendError,
  classifyUploadMime,
  decodeJwtPayload,
  isOwnedStorageKey,
  isValidStorageObjectKey,
  normalizeStorageFolder,
  parseR2Config,
  resolveStoragePublicUrl,
  validateDecodedFirebaseTokenClaims,
  type R2Config,
} from './src/utils/storageLogic.ts';
import {
  parseCallsConfig,
  buildCloudflareCallsUrl,
  formatCallsHeaders,
  extractCallsErrorMessage,
} from './src/utils/callsLogic.ts';

interface FirebaseAppletConfig {
  projectId: string;
  apiKey: string;
}

interface AuthenticatedUser {
  uid: string;
  email: string;
}

type AuthenticatedRequest = Request & {
  authUser?: AuthenticatedUser;
};

function loadFirebaseAppletConfig(): FirebaseAppletConfig {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<FirebaseAppletConfig>;
  if (!parsed.projectId || !parsed.apiKey) {
    throw new Error('Missing projectId or apiKey in firebase-applet-config.json');
  }
  return {
    projectId: parsed.projectId,
    apiKey: parsed.apiKey,
  };
}

const firebaseConfig = loadFirebaseAppletConfig();

function getR2ClientAndConfig(): {
  client: S3Client;
  config: R2Config;
} | null {
  const parsed = parseR2Config(process.env);
  if (!parsed.configured || !parsed.config) {
    return null;
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: parsed.config.endpoint,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: parsed.config.accessKeyId,
      secretAccessKey: parsed.config.secretAccessKey,
    },
  });
  return { client, config: parsed.config };
}

async function verifyFirebaseIdToken(
  idToken: string
): Promise<AuthenticatedUser> {
  const decoded = decodeJwtPayload(idToken);
  const claimsCheck = validateDecodedFirebaseTokenClaims(
    decoded,
    firebaseConfig.projectId
  );
  if (!claimsCheck.valid || !decoded?.sub) {
    throw new Error(claimsCheck.reason || 'Invalid authentication token.');
  }

  const lookupRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
      firebaseConfig.apiKey
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!lookupRes.ok) {
    throw new Error('Authentication token could not be verified.');
  }

  const data = (await lookupRes.json()) as {
    users?: Array<{
      localId?: string;
      email?: string;
      emailVerified?: boolean;
      disabled?: boolean;
    }>;
  };
  const user = data.users?.[0];
  if (!user || user.localId !== decoded.sub) {
    throw new Error('User record mismatch.');
  }
  if (user.disabled) {
    throw new Error('Account has been disabled.');
  }
  if (user.emailVerified !== true) {
    throw new Error('A verified email address is required.');
  }

  return {
    uid: user.localId,
    email: user.email || '',
  };
}

async function requireVerifiedFirebaseAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({
      error: 'Authentication required. Sign in with a verified Google account.',
    });
    return;
  }

  try {
    req.authUser = await verifyFirebaseIdToken(match[1].trim());
    next();
  } catch (err) {
    res.status(401).json({
      error:
        err instanceof Error
          ? err.message
          : 'Unauthorized authentication token.',
    });
  }
}

async function startServer(): Promise<void> {
  const app = express();
  const httpServer = http.createServer(app);
  const port = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, X-Content-Type, X-Filename, X-Folder'
    );
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get(['/api/storage/status', '/api/storage/status/'], (_req: Request, res: Response) => {
    const parsed = parseR2Config(process.env);
    res.json({
      provider: 'cloudflare-r2',
      configured: parsed.configured,
      bucket: parsed.bucketName,
      publicUrlConfigured: parsed.publicUrlConfigured,
      missing: parsed.missing,
    });
  });

  const handleStorageUpload = async (req: AuthenticatedRequest, res: Response) => {
      const r2 = getR2ClientAndConfig();
      if (!r2) {
        res.status(503).json({
          code: 'R2_NOT_CONFIGURED',
          error:
            'Cloudflare R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME in your Secrets.',
        });
        return;
      }

      const authUser = req.authUser;
      if (!authUser) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const rawBody = req.body;
      if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
        res.status(400).json({ error: 'Upload payload is empty.' });
        return;
      }

      const rawFilenameHeader = req.headers['x-filename'];
      const filename =
        typeof rawFilenameHeader === 'string'
          ? decodeURIComponent(rawFilenameHeader)
          : '';
      const rawFolderHeader = req.headers['x-folder'];
      const folder = normalizeStorageFolder(
        typeof rawFolderHeader === 'string' ? rawFolderHeader : undefined
      );
      const rawContentType =
        (typeof req.headers['x-content-type'] === 'string'
          ? req.headers['x-content-type']
          : req.headers['content-type']) || 'application/octet-stream';

      const classified = classifyUploadMime(rawContentType, filename);
      if (
        !classified.valid ||
        !classified.kind ||
        !classified.contentType ||
        !classified.extension ||
        !classified.maxBytes
      ) {
        res
          .status(400)
          .json({ error: classified.error || 'Unsupported file type.' });
        return;
      }

      if (rawBody.length > classified.maxBytes) {
        const maxMb = Math.round(classified.maxBytes / (1024 * 1024));
        res.status(413).json({
          error: `File exceeds the ${maxMb} MB limit for ${classified.kind} uploads.`,
        });
        return;
      }

      const key = buildStorageObjectKey(
        authUser.uid,
        folder,
        classified.extension
      );

      try {
        await r2.client.send(
          new PutObjectCommand({
            Bucket: r2.config.bucketName,
            Key: key,
            Body: rawBody,
            ContentType: classified.contentType,
            ContentLength: rawBody.length,
            CacheControl: 'public, max-age=31536000, immutable',
            Metadata: {
              uploader_uid: authUser.uid,
              media_kind: classified.kind,
            },
          })
        );

        const url = resolveStoragePublicUrl(key, r2.config.publicUrl);
        res.status(201).json({
          ok: true,
          provider: 'cloudflare-r2',
          bucket: r2.config.bucketName,
          key,
          url,
          kind: classified.kind,
          contentType: classified.contentType,
          size: rawBody.length,
        });
      } catch (err) {
        const info = classifyR2BackendError(err);
        console.warn(`[storage/upload] ${info.code}: ${info.message}`);
        res.status(info.status).json({
          code: info.code,
          error: info.message,
        });
      }
    };

  const uploadBodyParser = express.raw({ limit: '52mb', type: '*/*' });
  app.post(
    ['/api/storage/upload', '/api/storage/upload/'],
    requireVerifiedFirebaseAuth,
    uploadBodyParser,
    handleStorageUpload
  );
  app.put(
    ['/api/storage/upload', '/api/storage/upload/'],
    requireVerifiedFirebaseAuth,
    uploadBodyParser,
    handleStorageUpload
  );

  app.post(
    ['/api/storage/presign', '/api/storage/presign/'],
    requireVerifiedFirebaseAuth,
    express.json({ limit: '64kb' }),
    async (req: AuthenticatedRequest, res: Response) => {
      const r2 = getR2ClientAndConfig();
      if (!r2) {
        res.status(503).json({
          code: 'R2_NOT_CONFIGURED',
          error:
            'Cloudflare R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME in your Secrets.',
        });
        return;
      }

      const authUser = req.authUser;
      if (!authUser) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const body = (req.body || {}) as {
        filename?: string;
        contentType?: string;
        size?: number;
        folder?: string;
      };
      const classified = classifyUploadMime(
        body.contentType || '',
        body.filename || ''
      );
      if (
        !classified.valid ||
        !classified.kind ||
        !classified.contentType ||
        !classified.extension ||
        !classified.maxBytes
      ) {
        res
          .status(400)
          .json({ error: classified.error || 'Unsupported file type.' });
        return;
      }

      if (typeof body.size === 'number' && body.size > classified.maxBytes) {
        const maxMb = Math.round(classified.maxBytes / (1024 * 1024));
        res.status(413).json({
          error: `File exceeds the ${maxMb} MB limit for ${classified.kind} uploads.`,
        });
        return;
      }

      const folder = normalizeStorageFolder(body.folder);
      const key = buildStorageObjectKey(
        authUser.uid,
        folder,
        classified.extension
      );

      try {
        const command = new PutObjectCommand({
          Bucket: r2.config.bucketName,
          Key: key,
          ContentType: classified.contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        });
        const uploadUrl = await getSignedUrl(r2.client, command, {
          expiresIn: 300,
        });
        res.json({
          ok: true,
          provider: 'cloudflare-r2',
          bucket: r2.config.bucketName,
          key,
          uploadUrl,
          publicUrl: resolveStoragePublicUrl(key, r2.config.publicUrl),
          expiresIn: 300,
        });
      } catch (err) {
        const info = classifyR2BackendError(err);
        console.warn(`[storage/presign] ${info.code}: ${info.message}`);
        res.status(info.status).json({
          code: info.code,
          error: info.message,
        });
      }
    }
  );

  const handleGetStorageFile = async (req: Request, res: Response) => {
    const paramKey =
      typeof req.params[0] === 'string' ? decodeURIComponent(req.params[0]) : '';
    const queryKey = typeof req.query.key === 'string' ? req.query.key : '';
    const rawKey = paramKey || queryKey;
    if (!isValidStorageObjectKey(rawKey)) {
      res.status(400).json({ error: 'Invalid storage object key.' });
      return;
    }

    const r2 = getR2ClientAndConfig();
    if (!r2) {
      res.status(503).json({
        code: 'R2_NOT_CONFIGURED',
        error: 'Cloudflare R2 storage is not configured.',
      });
      return;
    }

    try {
      const rangeHeader =
        typeof req.headers.range === 'string' ? req.headers.range : undefined;
      const obj = await r2.client.send(
        new GetObjectCommand({
          Bucket: r2.config.bucketName,
          Key: rawKey,
          Range: rangeHeader,
        })
      );

      if (obj.ContentType) {
        res.setHeader('Content-Type', obj.ContentType);
      }
      if (typeof obj.ContentLength === 'number') {
        res.setHeader('Content-Length', String(obj.ContentLength));
      }
      if (obj.ContentRange) {
        res.setHeader('Content-Range', obj.ContentRange);
      }
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      if (obj.ContentRange) {
        res.status(206);
      }

      if (!obj.Body) {
        res.status(404).end();
        return;
      }

      const nodeStream =
        obj.Body instanceof Readable
          ? obj.Body
          : Readable.from(obj.Body as AsyncIterable<Uint8Array>);
      nodeStream.on('error', (streamErr) => {
        console.error('Cloudflare R2 stream error:', streamErr);
        if (!res.headersSent) {
          res.status(502).end();
        } else {
          res.end();
        }
      });
      nodeStream.pipe(res);
    } catch (err) {
      const name =
        err && typeof err === 'object' && 'name' in err
          ? String((err as { name?: string }).name)
          : '';
      if (name === 'NoSuchKey') {
        res.status(404).json({ error: 'Media object not found.' });
        return;
      }
      const info = classifyR2BackendError(err);
      console.warn(`[storage/get] ${info.code}: ${info.message}`);
      res.status(info.status).json({ code: info.code, error: info.message });
    }
  };

  app.get('/api/storage/file', handleGetStorageFile);
  app.get('/api/storage/file/*', handleGetStorageFile);

  app.get(
    '/api/storage/list',
    requireVerifiedFirebaseAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      const r2 = getR2ClientAndConfig();
      if (!r2) {
        res.status(503).json({
          code: 'R2_NOT_CONFIGURED',
          error: 'Cloudflare R2 storage is not configured.',
        });
        return;
      }
      const authUser = req.authUser;
      if (!authUser) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      try {
        const listed = await r2.client.send(
          new ListObjectsV2Command({
            Bucket: r2.config.bucketName,
            Prefix: `uploads/${authUser.uid}/`,
            MaxKeys: 50,
          })
        );
        const items = (listed.Contents || [])
          .filter((item): item is typeof item & { Key: string } => Boolean(item.Key))
          .map((item) => ({
            key: item.Key,
            url: resolveStoragePublicUrl(item.Key, r2.config.publicUrl),
            size: Number(item.Size || 0),
            lastModified: item.LastModified?.toISOString() || null,
          }));
        res.json({
          ok: true,
          provider: 'cloudflare-r2',
          bucket: r2.config.bucketName,
          items,
        });
      } catch (err) {
        const info = classifyR2BackendError(err);
        console.warn(`[storage/list] ${info.code}: ${info.message}`);
        res.status(info.status).json({ code: info.code, error: info.message });
      }
    }
  );

  app.delete(
    '/api/storage/file',
    requireVerifiedFirebaseAuth,
    express.json({ limit: '16kb' }),
    async (req: AuthenticatedRequest, res: Response) => {
      const r2 = getR2ClientAndConfig();
      if (!r2) {
        res.status(503).json({
          code: 'R2_NOT_CONFIGURED',
          error: 'Cloudflare R2 storage is not configured.',
        });
        return;
      }

      const authUser = req.authUser;
      if (!authUser) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const bodyKey =
        req.body && typeof (req.body as { key?: unknown }).key === 'string'
          ? (req.body as { key: string }).key
          : '';
      const queryKey = typeof req.query.key === 'string' ? req.query.key : '';
      const key = queryKey || bodyKey;

      if (!isValidStorageObjectKey(key)) {
        res.status(400).json({ error: 'Invalid storage object key.' });
        return;
      }

      if (!isOwnedStorageKey(authUser.uid, key)) {
        res
          .status(403)
          .json({ error: 'Forbidden: you can only delete your own files.' });
        return;
      }

      try {
        await r2.client.send(
          new DeleteObjectCommand({
            Bucket: r2.config.bucketName,
            Key: key,
          })
        );
        res.json({ ok: true, deletedKey: key });
      } catch (err) {
        const info = classifyR2BackendError(err);
        console.warn(`[storage/delete] ${info.code}: ${info.message}`);
        res.status(info.status).json({ code: info.code, error: info.message });
      }
    }
  );

  // Cloudflare Calls / RealtimeKit WebRTC Endpoints
  const readUpstreamJson = async (cfRes: globalThis.Response): Promise<Record<string, unknown>> => {
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
  };

  app.get(['/api/calls/status', '/api/calls/status/'], (_req: Request, res: Response) => {
    const parsed = parseCallsConfig(process.env);
    res.json({
      provider: 'cloudflare-calls',
      configured: parsed.configured,
      appId: parsed.appId,
      missing: parsed.configured
        ? []
        : [
            !process.env.CLOUDFLARE_CALLS_APP_ID ? 'CLOUDFLARE_CALLS_APP_ID' : null,
            !process.env.CLOUDFLARE_CALLS_APP_TOKEN ? 'CLOUDFLARE_CALLS_APP_TOKEN' : null,
          ].filter(Boolean),
    });
  });

  app.post(
    ['/api/calls/sessions/new', '/api/calls/sessions/new/'],
    async (_req: Request, res: Response) => {
      const parsed = parseCallsConfig(process.env);
      if (!parsed.configured || !parsed.config) {
        res.status(503).json({
          error:
            'Cloudflare Calls is not configured. Set CLOUDFLARE_CALLS_APP_ID and CLOUDFLARE_CALLS_APP_TOKEN.',
        });
        return;
      }

      try {
        const cfUrl = buildCloudflareCallsUrl(parsed.config.appId, 'sessions/new');
        const cfRes = await fetch(cfUrl, {
          method: 'POST',
          headers: formatCallsHeaders(parsed.config.appToken),
        });

        const data = await readUpstreamJson(cfRes);
        if (!cfRes.ok) {
          const message = extractCallsErrorMessage(data, cfRes.status);
          console.warn(`[calls/sessions/new] HTTP ${cfRes.status}: ${message}`);
          res.status(cfRes.status).json({ ...data, error: message });
          return;
        }

        res.status(201).json(data);
      } catch (err) {
        console.error('Failed to create Cloudflare Calls session:', err);
        res.status(502).json({ error: 'Failed to create Cloudflare Calls session.' });
      }
    }
  );

  app.get(
    ['/api/calls/sessions/:sessionId', '/api/calls/sessions/:sessionId/'],
    async (req: Request, res: Response) => {
      const parsed = parseCallsConfig(process.env);
      if (!parsed.configured || !parsed.config) {
        res.status(503).json({ error: 'Cloudflare Calls is not configured.' });
        return;
      }

      const sessionId = (req.params.sessionId || '').trim();
      if (!sessionId) {
        res.status(400).json({ error: 'Missing sessionId.' });
        return;
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
          const message = extractCallsErrorMessage(data, cfRes.status);
          res.status(cfRes.status).json({ ...data, error: message });
          return;
        }
        res.status(cfRes.status).json(data);
      } catch (err) {
        console.error('Failed to query Cloudflare Calls session:', err);
        res.status(502).json({ error: 'Failed to query Cloudflare Calls session.' });
      }
    }
  );

  app.post(
    ['/api/calls/sessions/:sessionId/tracks/new', '/api/calls/sessions/:sessionId/tracks/new/'],
    express.json({ limit: '256kb' }),
    async (req: Request, res: Response) => {
      const parsed = parseCallsConfig(process.env);
      if (!parsed.configured || !parsed.config) {
        res.status(503).json({
          error: 'Cloudflare Calls is not configured.',
        });
        return;
      }

      const sessionId = (req.params.sessionId || '').trim();
      if (!sessionId) {
        res.status(400).json({ error: 'Missing sessionId.' });
        return;
      }

      try {
        const cfUrl = buildCloudflareCallsUrl(
          parsed.config.appId,
          `sessions/${encodeURIComponent(sessionId)}/tracks/new`
        );
        const cfRes = await fetch(cfUrl, {
          method: 'POST',
          headers: formatCallsHeaders(parsed.config.appToken),
          body: JSON.stringify(req.body || {}),
        });

        const data = await readUpstreamJson(cfRes);
        if (!cfRes.ok) {
          const message = extractCallsErrorMessage(data, cfRes.status);
          console.warn(`[calls/tracks/new] HTTP ${cfRes.status}: ${message}`);
          res.status(cfRes.status).json({ ...data, error: message });
          return;
        }
        res.status(cfRes.status).json(data);
      } catch (err) {
        console.error('Failed to publish/subscribe tracks on Cloudflare Calls:', err);
        res.status(502).json({ error: 'Failed to negotiate tracks with Cloudflare Calls.' });
      }
    }
  );

  app.put(
    ['/api/calls/sessions/:sessionId/renegotiate', '/api/calls/sessions/:sessionId/renegotiate/'],
    express.json({ limit: '256kb' }),
    async (req: Request, res: Response) => {
      const parsed = parseCallsConfig(process.env);
      if (!parsed.configured || !parsed.config) {
        res.status(503).json({
          error: 'Cloudflare Calls is not configured.',
        });
        return;
      }

      const sessionId = (req.params.sessionId || '').trim();
      if (!sessionId) {
        res.status(400).json({ error: 'Missing sessionId.' });
        return;
      }

      try {
        const cfUrl = buildCloudflareCallsUrl(
          parsed.config.appId,
          `sessions/${encodeURIComponent(sessionId)}/renegotiate`
        );
        const cfRes = await fetch(cfUrl, {
          method: 'PUT',
          headers: formatCallsHeaders(parsed.config.appToken),
          body: JSON.stringify(req.body || {}),
        });

        const data = await readUpstreamJson(cfRes);
        if (!cfRes.ok) {
          const message = extractCallsErrorMessage(data, cfRes.status);
          console.warn(`[calls/renegotiate] HTTP ${cfRes.status}: ${message}`);
          res.status(cfRes.status).json({ ...data, error: message });
          return;
        }
        res.status(cfRes.status).json(data);
      } catch (err) {
        console.error('Failed to renegotiate Cloudflare Calls session:', err);
        res.status(502).json({ error: 'Failed to renegotiate Cloudflare Calls session.' });
      }
    }
  );

  app.put(
    ['/api/calls/sessions/:sessionId/tracks/close', '/api/calls/sessions/:sessionId/tracks/close/'],
    express.json({ limit: '64kb' }),
    async (req: Request, res: Response) => {
      const parsed = parseCallsConfig(process.env);
      if (!parsed.configured || !parsed.config) {
        res.status(503).json({
          error: 'Cloudflare Calls is not configured.',
        });
        return;
      }

      const sessionId = (req.params.sessionId || '').trim();
      if (!sessionId) {
        res.status(400).json({ error: 'Missing sessionId.' });
        return;
      }

      try {
        const cfUrl = buildCloudflareCallsUrl(
          parsed.config.appId,
          `sessions/${encodeURIComponent(sessionId)}/tracks/close`
        );
        const cfRes = await fetch(cfUrl, {
          method: 'PUT',
          headers: formatCallsHeaders(parsed.config.appToken),
          body: JSON.stringify(req.body || {}),
        });

        const data = await readUpstreamJson(cfRes);
        if (!cfRes.ok) {
          const message = extractCallsErrorMessage(data, cfRes.status);
          console.warn(`[calls/tracks/close] HTTP ${cfRes.status}: ${message}`);
          res.status(cfRes.status).json({ ...data, error: message });
          return;
        }
        res.status(cfRes.status).json(data);
      } catch (err) {
        console.error('Failed to close tracks on Cloudflare Calls:', err);
        res.status(502).json({ error: 'Failed to close tracks on Cloudflare Calls.' });
      }
    }
  );

  // Express error handler (e.g. payload > 52mb)
  app.use(
    (err: unknown, _req: Request, res: Response, next: NextFunction): void => {
      if (
        err &&
        typeof err === 'object' &&
        'type' in err &&
        (err as { type?: string }).type === 'entity.too.large'
      ) {
        res.status(413).json({ error: 'Uploaded file exceeds the 50 MB server limit.' });
        return;
      }
      next(err);
    }
  );

  // Ensure unknown /api/* routes return JSON instead of falling through to static/Vite 405 handlers
  app.all('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      error: `API route not found: ${req.method} ${req.path}`,
    });
  });

  if (isProd) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Looma server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Looma server:', err);
  process.exit(1);
});
