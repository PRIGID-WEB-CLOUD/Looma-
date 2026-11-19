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
    CLOUDFLARE_TURN_KEY_ID: process.env.CLOUDFLARE_TURN_KEY_ID,
    CLOUDFLARE_TURN_KEY_TOKEN: process.env.CLOUDFLARE_TURN_KEY_TOKEN,
    CALLS_STATE_SECRET: process.env.CALLS_STATE_SECRET,
    TURN_URLS: process.env.TURN_URLS,
    TURN_USERNAME: process.env.TURN_USERNAME,
    TURN_CREDENTIAL: process.env.TURN_CREDENTIAL,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    COMMERCE_API_URL: process.env.COMMERCE_API_URL,
    COMMERCE_DEFAULT_STORE_ID: process.env.COMMERCE_DEFAULT_STORE_ID,
    COMMERCE_INTERNAL_SSO_SECRET: process.env.COMMERCE_INTERNAL_SSO_SECRET,
    COMMERCE_PUBLISHABLE_KEY: process.env.COMMERCE_PUBLISHABLE_KEY,
    COMMERCE_ADMIN_DASHBOARD_URL: process.env.COMMERCE_ADMIN_DASHBOARD_URL,
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
  const commerceDistDir = path.resolve(process.cwd(), 'dist-commerce');
  const reqUrl = new URL(req.url || '/', 'http://localhost');
  let cleanRel = decodeURIComponent(reqUrl.pathname).replace(/^\/+/, '');

  let targetPath = path.resolve(distDir, cleanRel || 'index.html');

  if (cleanRel.startsWith('commerce') || cleanRel.startsWith('looma-commerce') || cleanRel.startsWith('seller')) {
    const commerceRel = cleanRel.replace(/^(commerce|looma-commerce|seller)\/?/, '');
    targetPath = path.resolve(commerceDistDir, commerceRel || 'index.html');
    if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
      targetPath = path.join(commerceDistDir, 'index.html');
    }
  } else {
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
      targetPath = path.join(targetPath, 'index.html');
    }

    if (!targetPath.startsWith(distDir) || !fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
      if (cleanRel.startsWith('admin')) {
        targetPath = path.join(distDir, 'admin', 'index.html');
      } else if (cleanRel.startsWith('landingpage')) {
        targetPath = path.join(distDir, 'landingpage', 'index.html');
      } else {
        targetPath = path.join(distDir, 'index.html');
      }
    }
  }

  if (!fs.existsSync(targetPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = path.extname(targetPath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_BY_EXT[ext] || 'application/octet-stream',
  });
  fs.createReadStream(targetPath)
    .on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Server error');
      }
    })
    .pipe(res);
}

async function startDevServer(): Promise<void> {
  const port = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  const honoListener = getRequestListener((request) =>
    worker.fetch(request, buildNodeWorkerEnv())
  );

  let viteMiddlewares: ((req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void) | null = null;
  let commerceViteMiddlewares: ((req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void) | null = null;

  const httpServer = http.createServer(async (req, res) => {
    const rawUrl = req.url || '/';
    const [pathname, search] = rawUrl.split('?');
    const queryString = search ? `?${search}` : '';

    if (pathname === '/admin') {
      res.writeHead(302, { Location: `/admin/${queryString}` });
      res.end();
      return;
    }
    if (pathname === '/commerce' || pathname === '/looma-commerce') {
      res.writeHead(302, { Location: `/seller/${queryString}` });
      res.end();
      return;
    }
    if (pathname === '/seller') {
      res.writeHead(302, { Location: `/seller/${queryString}` });
      res.end();
      return;
    }
    if (pathname === '/landingpage') {
      res.writeHead(302, { Location: `/landingpage/${queryString}` });
      res.end();
      return;
    }

    if (pathname.startsWith('/api/')) {
      void honoListener(req, res);
      return;
    }

    if (!isProd) {
      if (pathname.startsWith('/seller')) {
        if (commerceViteMiddlewares) {
          commerceViteMiddlewares(req, res, () => {
            serveDistAsset(req, res);
          });
          return;
        }
      } else if (pathname.startsWith('/commerce') || pathname.startsWith('/looma-commerce')) {
        res.writeHead(302, { Location: `/seller/${queryString}` });
        res.end();
        return;
      } else if (viteMiddlewares) {
        viteMiddlewares(req, res, () => {
          void honoListener(req, res);
        });
        return;
      }
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

    try {
      const commerceVite = await createViteServer({
        configFile: path.resolve(process.cwd(), 'vite.commerce.config.ts'),
        server: {
          middlewareMode: true,
          allowedHosts: true,
        },
        appType: 'spa',
      });
      commerceViteMiddlewares = commerceVite.middlewares;
    } catch (e) {
      console.warn('Failed to start commerce vite middleware:', e);
    }
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Looma Hono+Vite dev server listening on http://0.0.0.0:${port}`);
  });
}

startDevServer().catch((err) => {
  console.error('Failed to start Looma server:', err);
  process.exit(1);
});
