import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig, loadEnv, type ConfigEnv, type UserConfig } from 'vite';
import { ipcCheckPlugin } from './scripts/vite-plugin-ipc-check';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_DEV_PORT = 5173;

export default defineConfig(async ({ mode }: ConfigEnv) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'TAURI_']);
  const buildTargetEnv = env['VITE_BUILD_TARGET'] || process.env['VITE_BUILD_TARGET'];
  const isWebBuild = buildTargetEnv === 'web';
  const isElectronBuild = buildTargetEnv === 'electron';
  const isBrowserBundle = isWebBuild || isElectronBuild;

  const requestedPort = Number(env['VITE_DEV_PORT']) || DEFAULT_DEV_PORT;
  const tauriDevHost = env['TAURI_DEV_HOST'] || '127.0.0.1';

  const devHmrOrigins = [`ws://127.0.0.1:${requestedPort}`, `ws://localhost:${requestedPort}`];
  const devWebAppOrigin = (() => {
    const configured = env['VITE_WEB_APP_URL'] || process.env['VITE_WEB_APP_URL'];
    if (!configured) return null;
    try {
      const origin = new URL(configured).origin;
      return origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')
        ? origin
        : null;
    } catch {
      return null;
    }
  })();

  const isWindows = env['TAURI_PLATFORM'] === 'windows';
  const isDebug = Boolean(env['TAURI_DEBUG']);
  const browserShimDir = (module: string) =>
    isElectronBuild &&
    [
      'core',
      'window',
      'deep-link',
      'dialog',
      'shell',
      'notification',
      'process',
      'updater',
    ].includes(module)
      ? './src/lib/tauri-electron'
      : './src/lib/tauri-web';
  const webTauriAliases = isBrowserBundle
    ? {
        '@tauri-apps/api/core': path.resolve(__dirname, `${browserShimDir('core')}/core.ts`),
        '@tauri-apps/api/event': path.resolve(__dirname, './src/lib/tauri-web/event.ts'),
        '@tauri-apps/api/window': path.resolve(__dirname, `${browserShimDir('window')}/window.ts`),
        '@tauri-apps/api/path': path.resolve(__dirname, './src/lib/tauri-web/path.ts'),
        '@tauri-apps/plugin-deep-link': path.resolve(
          __dirname,
          `${browserShimDir('deep-link')}/deep-link.ts`,
        ),
        '@tauri-apps/plugin-dialog': path.resolve(
          __dirname,
          `${browserShimDir('dialog')}/dialog.ts`,
        ),
        '@tauri-apps/plugin-shell': path.resolve(__dirname, `${browserShimDir('shell')}/shell.ts`),
        '@tauri-apps/plugin-fs': path.resolve(__dirname, './src/lib/tauri-web/fs.ts'),
        '@tauri-apps/plugin-notification': path.resolve(
          __dirname,
          `${browserShimDir('notification')}/notification.ts`,
        ),
        '@tauri-apps/plugin-process': path.resolve(
          __dirname,
          `${browserShimDir('process')}/process.ts`,
        ),
        '@tauri-apps/plugin-updater': path.resolve(
          __dirname,
          `${browserShimDir('updater')}/updater.ts`,
        ),
      }
    : {};

  const buildTarget = isWindows ? 'chrome105' : 'safari15';

  const config: UserConfig = {
    base: isBrowserBundle ? '/' : undefined,

    plugins: [
      react({
        devTarget: 'esnext',
      }),
      tailwindcss(),
      ...(isBrowserBundle
        ? []
        : [
            ipcCheckPlugin({
              srcDir: path.resolve(__dirname, './src'),
              srcTauriDir: path.resolve(__dirname, './src-tauri/src'),
              failOnDrift: false,
            }),
          ]),
    ],

    server: {
      port: requestedPort,
      strictPort: true,
      host: tauriDevHost,
      hmr: {
        protocol: 'ws',
        host: tauriDevHost,
        port: requestedPort,
      },
      watch: {
        ignored: ['**/src-tauri/**', '**/target/**'],
      },
      headers: {
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
          "style-src 'self' 'unsafe-inline' 'unsafe-hashes' https://fonts.googleapis.com",
          'img-src * data: blob:',
          "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net data:",
          [
            "connect-src 'self'",
            ...devHmrOrigins,
            'ipc:',
            'https://api.agiworkforce.com',
            'https://agiworkforce.com',
            'https://api.stripe.com',
            'https://agiworkforce-signaling.fly.dev',
            'wss://agiworkforce-signaling.fly.dev',
            'http://localhost:11434',
            'http://127.0.0.1:11434',
            ...(devWebAppOrigin ? [devWebAppOrigin] : []),
          ].join(' '),
          "frame-src 'self' https://js.stripe.com",
          "frame-ancestors 'none'",
          "media-src 'self' blob:",
          "worker-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; '),
      },
    },

    preview: {
      port: 4173,
      strictPort: true,
    },

    envPrefix: ['VITE_', 'TAURI_'],

    build: {
      target: isBrowserBundle ? 'esnext' : buildTarget,

      minify: isDebug ? false : 'esbuild',

      sourcemap: mode !== 'production',

      outDir: 'dist',

      reportCompressedSize: true,

      cssCodeSplit: true,

      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (
              id.includes('/apps/desktop/src/runtime/') ||
              id.includes('/apps/desktop/src/lib/tauri-mock.ts') ||
              id.includes('/apps/desktop/src/lib/cloudChatStream.ts') ||
              id.includes('/apps/desktop/src/api/') ||
              id.includes('/packages/client/client-runtime/src/')
            ) {
              return 'desktop-core';
            }

            if (!id.includes('node_modules')) {
              return undefined;
            }

            if (id.includes('/react/') || id.includes('/react-dom/')) {
              return 'react-vendor';
            }

            if (id.includes('/@radix-ui/')) {
              return 'ui-vendor';
            }

            if (!isBrowserBundle && id.includes('/@xterm/')) {
              return 'terminal-vendor';
            }

            if (
              id.includes('/react-markdown/') ||
              id.includes('/remark-gfm/') ||
              id.includes('/rehype-highlight/') ||
              id.includes('/katex/') ||
              id.includes('/rehype-katex/') ||
              id.includes('/remark-math/') ||
              id.includes('/highlight.js/') ||
              id.includes('/react-syntax-highlighter/')
            ) {
              return 'markdown-vendor';
            }

            if (id.includes('/recharts/')) {
              return 'charts-vendor';
            }

            if (id.includes('/mermaid/')) {
              return 'diagram-vendor';
            }

            if (id.includes('/monaco-editor/')) {
              return 'monaco-vendor';
            }

            if (id.includes('/react-window/') || id.includes('/react-virtualized-auto-sizer/')) {
              return 'virtualization-vendor';
            }

            if (
              id.includes('/framer-motion/') ||
              id.includes('/date-fns/') ||
              id.includes('/clsx/') ||
              id.includes('/fuse.js/')
            ) {
              return 'utility-vendor';
            }

            if (id.includes('/pdfjs-dist/')) {
              return 'pdf-vendor';
            }

            return undefined;
          },

          assetFileNames: 'assets/[name]-[hash][extname]',
          chunkFileNames: 'chunks/[name]-[hash].js',
          entryFileNames: '[name]-[hash].js',
        },
      },

      chunkSizeWarningLimit: 1500,

      assetsInlineLimit: 4096,
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@components': path.resolve(__dirname, './src/components'),
        '@stores': path.resolve(__dirname, './src/stores'),
        '@hooks': path.resolve(__dirname, './src/hooks'),
        '@utils': path.resolve(__dirname, './src/utils'),
        '@styles': path.resolve(__dirname, './src/styles'),
        '@types': path.resolve(__dirname, './src/types'),
        '@assets': path.resolve(__dirname, './src/assets'),
        '@lib': path.resolve(__dirname, './src/lib'),
        '@agiworkforce/client-runtime': path.resolve(
          __dirname,
          '../../packages/client/client-runtime/src/desktop-index.ts',
        ),
        '@agiworkforce/cloud-contracts': path.resolve(
          __dirname,
          '../../packages/contracts/cloud-contracts/src/index.ts',
        ),
        '@agiworkforce/artifacts': path.resolve(
          __dirname,
          '../../packages/platform/artifacts/src/index.ts',
        ),
        '@agiworkforce/sync': path.resolve(__dirname, '../../packages/client/sync/src/index.ts'),
        '@agiworkforce/trust-boundaries': path.resolve(
          __dirname,
          '../../packages/contracts/trust-boundaries/src/index.ts',
        ),
        '@agiworkforce/utils/uuidv7': path.resolve(
          __dirname,
          '../../packages/platform/utils/src/uuidv7.ts',
        ),
        '@agiworkforce/utils/display-name': path.resolve(
          __dirname,
          '../../packages/platform/utils/src/displayName.ts',
        ),
        '@agiworkforce/utils/composer-paste': path.resolve(
          __dirname,
          '../../packages/platform/utils/src/composerPaste.ts',
        ),
        '@agiworkforce/utils/markdown-source': path.resolve(
          __dirname,
          '../../packages/platform/utils/src/markdownSource.ts',
        ),
        '@agiworkforce/utils': path.resolve(
          __dirname,
          '../../packages/platform/utils/src/index.ts',
        ),
        ...webTauriAliases,
      },
    },

    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'zustand',
        ...(isBrowserBundle ? [] : ['@tauri-apps/api']),
        'framer-motion',
        'clsx',
        'date-fns',
        'highlight.js',
        'react-syntax-highlighter',
      ],
      exclude: isBrowserBundle ? [] : ['@tauri-apps/cli'],
      force: false,
    },

    css: {
      modules: {
        localsConvention: 'camelCase',
      },
      devSourcemap: true,
    },

    define: {
      __APP_VERSION__: JSON.stringify(env['npm_package_version'] || '0.0.0'),
      __DEV__: JSON.stringify(mode === 'development'),
      __PROD__: JSON.stringify(mode === 'production'),
      __WEB_BUILD__: JSON.stringify(isBrowserBundle),
      __ELECTRON_BUILD__: JSON.stringify(isElectronBuild),
    },

    esbuild: {
      drop: mode === 'production' ? ['debugger', 'console'] : [],
      legalComments: 'none',
      keepNames: true,
    },

    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: true,
      alias: {
        'monaco-editor': path.resolve(__dirname, './src/test/__mocks__/monaco-editor.ts'),
      },
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/e2e/**',
        '**/playwright/**',
        '**/src-tauri/**',
        '**/wdio/**',
      ],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/*.d.ts', '**/test/**'],
      },
    },
  };

  return config;
});
