import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const commerceAdminRoot = path.resolve(
  import.meta.dirname,
  'commerce/artifacts/luxe-boutique-admin'
);
const commerceAssetsDir = path.resolve(
  import.meta.dirname,
  'commerce/attached_assets'
);
const tenantRoutingEntry = path.resolve(
  import.meta.dirname,
  'commerce/lib/tenant-routing/src/index.ts'
);
const commerceDistDir = path.resolve(import.meta.dirname, 'dist-commerce');
const workerSellerDistDir = path.resolve(import.meta.dirname, 'dist/seller');

function syncSellerDistToWorkerAssets(): Plugin {
  return {
    name: 'sync-seller-dist-to-worker-assets',
    closeBundle() {
      const distRoot = path.resolve(import.meta.dirname, 'dist');
      if (!fs.existsSync(distRoot) || !fs.existsSync(commerceDistDir)) {
        return;
      }
      fs.rmSync(workerSellerDistDir, { recursive: true, force: true });
      fs.cpSync(commerceDistDir, workerSellerDistDir, { recursive: true });
    },
  };
}

export default defineConfig({
  base: '/seller/',
  publicDir: path.resolve(commerceAdminRoot, 'public'),
  plugins: [react(), tailwindcss(), syncSellerDistToWorkerAssets()],
  resolve: {
    alias: {
      '@': path.resolve(commerceAdminRoot, 'src'),
      '@assets': commerceAssetsDir,
      '@workspace/tenant-routing': tenantRoutingEntry,
    },
    dedupe: ['react', 'react-dom'],
  },
  root: commerceAdminRoot,
  build: {
    outDir: commerceDistDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(commerceAdminRoot, 'index.html'),
      },
    },
  },
  server: {
    fs: {
      strict: false,
    },
  },
});
