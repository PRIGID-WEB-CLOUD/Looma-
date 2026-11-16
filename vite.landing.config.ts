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
  publicDir: path.resolve(import.meta.dirname, 'public'),
  plugins: [react(), tailwindcss(), promoteRootIndexHtml('landingpage')],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  build: {
    outDir: 'dist-landing',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        landing: path.resolve(import.meta.dirname, 'landingpage/index.html'),
      },
    },
  },
});
