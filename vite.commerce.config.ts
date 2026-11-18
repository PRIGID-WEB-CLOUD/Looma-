import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

function promoteRootIndexHtml(entrySubdir: string): Plugin {
  let outDirAbs = '';
  return {
    name: 'promote-root-index-html',
    configResolved(config) {
      outDirAbs = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const nestedHtml = path.join(outDirAbs, entrySubdir, 'index.html');
      const rootHtml = path.join(outDirAbs, 'index.html');
      if (fs.existsSync(nestedHtml)) {
        fs.renameSync(nestedHtml, rootHtml);
        fs.rmSync(path.join(outDirAbs, entrySubdir), { recursive: true, force: true });
      }
    },
  };
}

export default defineConfig({
  base: '/',
  publicDir: path.resolve(import.meta.dirname, 'artifacts/luxe-boutique-admin/public'),
  plugins: [react(), tailwindcss(), promoteRootIndexHtml('commerce')],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'artifacts/luxe-boutique-admin/src'),
      '@assets': path.resolve(import.meta.dirname, 'attached_assets'),
      '@workspace/tenant-routing': path.resolve(import.meta.dirname, 'artifacts/luxe-boutique-admin/src'),
    },
  },
  root: path.resolve(import.meta.dirname, 'artifacts/luxe-boutique-admin'),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist-commerce'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        commerce: path.resolve(import.meta.dirname, 'artifacts/luxe-boutique-admin/index.html'),
      },
    },
  },
});
