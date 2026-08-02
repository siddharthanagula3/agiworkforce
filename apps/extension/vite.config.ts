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
  // Explicit process environment is authoritative for CI/release builds. An
  // empty value in a Vite env file must not shadow protected workflow
  // configuration and produce a package whose auth cannot boot.
  const buildConfiguration = resolveChromeBuildConfiguration(env, process.env);
  const clerkPublishableKey = buildConfiguration.clerkPublishableKey ?? '';
  const clerkSyncHost = buildConfiguration.clerkSyncHost ?? '';
  const sourceManifest = JSON.parse(
    readFileSync(resolve(__dirname, 'manifest.json'), 'utf8'),
  ) as Record<string, unknown>;
  const configuredManifest = configureChromeManifest(sourceManifest, buildConfiguration);

  // The content script runs in the page's world and is loaded by Chrome as a
  // standalone script. If Rollup code-splits it (shared chunks imported by 2+
  // entries), it emits `import ... from "../assets/*.js"` INTO content.js, which
  // fails at runtime with "Cannot use import statement outside a module" (a
  // content script cannot import non-web-accessible chunks) — silently breaking
  // ALL content-script features (autofill, page capture, in-page panel) on every
  // page. So the content script is built in its own pass as a single
  // self-contained file (inlineDynamicImports, one input), while the module-
  // context entries (background service worker, side panel + options extension
  // pages) keep normal chunking in the main pass. BUILD_TARGET selects the pass;
  // package.json `build` runs main then content (emptyOutDir only on main).
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
      minify: 'terser',
      sourcemap: mode !== 'production',
      rollupOptions: {
        input: {
          background: resolve(__dirname, 'src/background.ts'),
          side_panel: resolve(__dirname, 'src/side_panel.ts'),
          options: resolve(__dirname, 'src/options.ts'),
        },
        output: {
          entryFileNames: (chunk) => {
            if (chunk.name === 'background') return 'src/background.js';
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
