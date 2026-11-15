import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { getRequestListener } from '@hono/node-server';
import worker, { type WorkerEnv } from './src/worker.ts';

function buildNodeWorkerEnv(): WorkerEnv {
  return {
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
    FIREBASE_DATABASE_ID: process.env.FIREBASE_DATABASE_ID,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
    APP_URL: process.env.APP_URL,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_ACCESS_KEY_ID: process.env.CLOUDFLARE_ACCESS_KEY_ID,
    CLOUDFLARE_SECRET_ACCESS_KEY: process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
    CLOUDFLARE_R2_BUCKET_NAME: process.env.CLOUDFLARE_R2_BUCKET_NAME,
    CLOUDFLARE_R2_PUBLIC_DOMAIN: process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN,
    CLOUDFLARE_R2_PUBLIC_URL: process.env.CLOUDFLARE_R2_PUBLIC_URL,
    CLOUDFLARE_CALLS_APP_ID: process.env.CLOUDFLARE_CALLS_APP_ID,
    CLOUDFLARE_CALLS_APP_TOKEN: process.env.CLOUDFLARE_CALLS_APP_TOKEN,
    CALLS_STATE_SECRET: process.env.CALLS_STATE_SECRET,
    TURN_URLS: process.env.TURN_URLS,
    TURN_USERNAME: process.env.TURN_USERNAME,
    TURN_CREDENTIAL: process.env.TURN_CREDENTIAL,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  };
}

const MIME_BY_EXT: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveDistAsset(req: http.IncomingMessage, res: http.ServerResponse): void {
  const distDir = path.resolve(process.cwd(), 'dist');
  const reqUrl = new URL(req.url || '/', 'http://localhost');
  const cleanRel = decodeURIComponent(reqUrl.pathname).replace(/^\/+/, '');
  let targetPath = path.resolve(distDir, cleanRel || 'index.html');

  if (!targetPath.startsWith(distDir) || !fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
    targetPath = path.join(distDir, 'index.html');
  }

  const ext = path.extname(targetPath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_BY_EXT[ext] || 'application/octet-stream',
  });
  fs.createReadStream(targetPath).pipe(res);
}

async function startDevServer(): Promise<void> {
  const port = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  const honoListener = getRequestListener((request) =>
    worker.fetch(request, buildNodeWorkerEnv())
  );

  let viteMiddlewares: ((req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void) | null = null;

  const httpServer = http.createServer((req, res) => {
    const pathname = (req.url || '').split('?')[0];
    if (pathname.startsWith('/api/')) {
      void honoListener(req, res);
      return;
    }

    if (!isProd && viteMiddlewares) {
      viteMiddlewares(req, res, () => {
        void honoListener(req, res);
      });
      return;
    }

    serveDistAsset(req, res);
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    viteMiddlewares = vite.middlewares;
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Looma Hono+Vite dev server listening on http://0.0.0.0:${port}`);
  });
}

startDevServer().catch((err) => {
  console.error('Failed to start Looma server:', err);
  process.exit(1);
});
