import { defineConfig, loadEnv } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  configureChromeManifest,
  resolveChromeBuildConfiguration,
} from './scripts/manifest-config.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const buildConfiguration = resolveChromeBuildConfiguration(env, process.env);
  const clerkPublishableKey = buildConfiguration.clerkPublishableKey ?? '';
  const clerkSyncHost = buildConfiguration.clerkSyncHost ?? '';
  const sourceManifest = JSON.parse(
    readFileSync(resolve(__dirname, 'manifest.json'), 'utf8'),
  ) as Record<string, unknown>;
  const configuredManifest = configureChromeManifest(sourceManifest, buildConfiguration);

  const target = process.env['BUILD_TARGET'] === 'content' ? 'content' : 'main';

  if (target === 'content') {
    return {
      root: __dirname,
      define: {
        'process.env.CLERK_PUBLISHABLE_KEY': JSON.stringify(clerkPublishableKey),
        'process.env.CLERK_SYNC_HOST': JSON.stringify(clerkSyncHost),
      },
      publicDir: false,
      build: {
        outDir: 'dist',
        emptyOutDir: false, // preserve the main pass's output
        minify: 'terser',
        sourcemap: mode !== 'production',
        rollupOptions: {
          input: { content: resolve(__dirname, 'src/content.ts') },
          output: {
            format: 'iife', // self-contained classic script: no import/export
            entryFileNames: 'src/content.js',
            inlineDynamicImports: true,
          },
        },
      },
    };
  }

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
      // The extension CSP has no data: in font-src, so a font inlined as a
      // data URI is refused and KaTeX falls back to the wrong glyphs.
      assetsInlineLimit: (filePath: string) => (filePath.endsWith('.woff2') ? false : undefined),
      minify: 'terser',
      sourcemap: mode !== 'production',
      rollupOptions: {
        input: {
          background: resolve(__dirname, 'src/background.ts'),
          side_panel: resolve(__dirname, 'src/side_panel.ts'),
          options: resolve(__dirname, 'src/options.ts'),
          welcome: resolve(__dirname, 'src/welcome.ts'),
        },
        output: {
          entryFileNames: (chunk) => {
            if (chunk.name === 'background') return 'src/background.js';
            if (chunk.name === 'side_panel') return 'src/side_panel.js';
            if (chunk.name === 'options') return 'src/options.js';
            if (chunk.name === 'welcome') return 'src/welcome.js';
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
        name: 'agi-katex-woff2-only',
        enforce: 'pre',
        transform(code, id) {
          if (!/katex\/dist\/katex\.min\.css(?:\?|$)/.test(id)) return null;
          return code.replace(
            /,url\(fonts\/[^)]+\.(?:woff|ttf)\) format\("(?:woff|truetype)"\)/g,
            '',
          );
        },
      },
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
          { src: '_locales', dest: '.' },
          { src: 'managed-schema.json', dest: '.' },
          { src: 'src/side_panel.html', dest: 'src' },
          { src: 'src/side_panel.css', dest: 'src' },
          { src: 'src/options.html', dest: 'src' },
          { src: 'src/options.css', dest: 'src' },
          { src: 'src/welcome.html', dest: 'src' },
        ],
      }),
    ],
  };
});
