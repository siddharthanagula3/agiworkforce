import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'node:path';

export default defineConfig({
  root: __dirname,
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'terser',
    sourcemap: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        content: resolve(__dirname, 'src/content.ts'),
        popup: resolve(__dirname, 'src/popup.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'src/background.js';
          if (chunk.name === 'content') return 'src/content.js';
          if (chunk.name === 'popup') return 'src/popup.js';
          return 'assets/[name]-[hash].js';
        },
        assetFileNames: (asset) => {
          if (asset.name?.endsWith('.html')) return 'src/[name][extname]';
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'manifest.json', dest: '.' },
        { src: 'icons', dest: '.' },
        { src: 'src/popup.html', dest: 'src' },
      ],
    }),
  ],
});
