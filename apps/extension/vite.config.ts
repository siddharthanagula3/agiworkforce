import { defineConfig, loadEnv } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  configureChromeManifest,
  readChromeBuildConfiguration,
} from './scripts/manifest-config.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const clerkPublishableKey =
    env['CLERK_PUBLISHABLE_KEY'] ?? process.env['CLERK_PUBLISHABLE_KEY'] ?? '';
  const clerkSyncHost = env['CLERK_SYNC_HOST'] ?? process.env['CLERK_SYNC_HOST'] ?? '';
  const buildConfiguration = readChromeBuildConfiguration({ ...env, ...process.env });
  const sourceManifest = JSON.parse(
    readFileSync(resolve(__dirname, 'manifest.json'), 'utf8'),
  ) as Record<string, unknown>;
  const configuredManifest = configureChromeManifest(sourceManifest, buildConfiguration);

  return {
    root: __dirname,
    define: {
      'process.env.CLERK_PUBLISHABLE_KEY': JSON.stringify(clerkPublishableKey),
      'process.env.CLERK_SYNC_HOST': JSON.stringify(clerkSyncHost),
    },
    publicDir: false,
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      minify: 'terser',
      sourcemap: mode !== 'production',
      rollupOptions: {
        input: {
          background: resolve(__dirname, 'src/background.ts'),
          content: resolve(__dirname, 'src/content.ts'),
          side_panel: resolve(__dirname, 'src/side_panel.ts'),
          options: resolve(__dirname, 'src/options.ts'),
        },
        output: {
          entryFileNames: (chunk) => {
            if (chunk.name === 'background') return 'src/background.js';
            if (chunk.name === 'content') return 'src/content.js';
            if (chunk.name === 'side_panel') return 'src/side_panel.js';
            if (chunk.name === 'options') return 'src/options.js';
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
      {
        name: 'agi-configured-chrome-manifest',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'manifest.json',
            source: `${JSON.stringify(configuredManifest, null, 2)}\n`,
          });
        },
      },
      viteStaticCopy({
        targets: [
          { src: 'icons', dest: '.' },
          { src: 'src/side_panel.html', dest: 'src' },
          { src: 'src/side_panel.css', dest: 'src' },
          { src: 'src/options.html', dest: 'src' },
          { src: 'src/options.css', dest: 'src' },
        ],
      }),
    ],
  };
});
