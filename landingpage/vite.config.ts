import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

function resolveModulesDir(): string {
  const local = path.resolve(import.meta.dirname, 'node_modules');
  return fs.existsSync(local) ? local : path.resolve(import.meta.dirname, '../node_modules');
}

const modulesDir = resolveModulesDir();

export default defineConfig({
  base: '/',
  publicDir: path.resolve(import.meta.dirname, '../public'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(import.meta.dirname, '..') },
      { find: /^react(\/.*)?$/, replacement: `${path.join(modulesDir, 'react')}$1` },
      { find: /^react-dom(\/.*)?$/, replacement: `${path.join(modulesDir, 'react-dom')}$1` },
      { find: /^lucide-react(\/.*)?$/, replacement: `${path.join(modulesDir, 'lucide-react')}$1` },
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-ui';
          }
          return undefined;
        },
      },
    },
  },
});
