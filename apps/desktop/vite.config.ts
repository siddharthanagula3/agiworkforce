import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig, loadEnv, type ConfigEnv, type UserConfig } from 'vite';

// ESM-compatible __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_DEV_PORT = 5173;

/**
 * Vite 7 configuration for AGI Workforce Desktop app.
 *
 * Features:
 * - Environment-based configuration using loadEnv
 * - Optimized build settings for Tauri desktop app
 * - Organized plugin configuration
 * - Modern ESNext build target with fallbacks for older platforms
 */
export default defineConfig(async ({ mode }: ConfigEnv) => {
  // Load environment variables based on mode (development, production, test)
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'TAURI_']);
  const isWebBuild = env['VITE_BUILD_TARGET'] === 'web';

  // Determine port configuration
  const requestedPort = Number(env['VITE_DEV_PORT']) || DEFAULT_DEV_PORT;
  const tauriDevHost = env['TAURI_DEV_HOST'] || '127.0.0.1';

  // Determine build targets based on platform
  const isWindows = env['TAURI_PLATFORM'] === 'windows';
  const isDebug = Boolean(env['TAURI_DEBUG']);
  const webTauriAliases = isWebBuild
    ? {
        '@tauri-apps/api/core': path.resolve(__dirname, './src/lib/tauri-web/core.ts'),
        '@tauri-apps/api/event': path.resolve(__dirname, './src/lib/tauri-web/event.ts'),
        '@tauri-apps/api/window': path.resolve(__dirname, './src/lib/tauri-web/window.ts'),
        '@tauri-apps/api/path': path.resolve(__dirname, './src/lib/tauri-web/path.ts'),
        '@tauri-apps/plugin-deep-link': path.resolve(__dirname, './src/lib/tauri-web/deep-link.ts'),
        '@tauri-apps/plugin-dialog': path.resolve(__dirname, './src/lib/tauri-web/dialog.ts'),
        '@tauri-apps/plugin-shell': path.resolve(__dirname, './src/lib/tauri-web/shell.ts'),
        '@tauri-apps/plugin-fs': path.resolve(__dirname, './src/lib/tauri-web/fs.ts'),
        '@tauri-apps/plugin-notification': path.resolve(
          __dirname,
          './src/lib/tauri-web/notification.ts',
        ),
        '@tauri-apps/plugin-process': path.resolve(__dirname, './src/lib/tauri-web/process.ts'),
        '@tauri-apps/plugin-updater': path.resolve(__dirname, './src/lib/tauri-web/updater.ts'),
      }
    : {};

  // Build target: Use esnext for modern builds, with platform-specific fallbacks
  const buildTarget = isWindows ? 'chrome105' : 'safari14';

  const config: UserConfig = {
    base: isWebBuild ? '/' : undefined,

    // ===================
    // Plugins
    // ===================
    plugins: [
      // React plugin with SWC for faster builds
      react({
        // Enable React Refresh for Fast HMR
        devTarget: 'esnext',
      }),
      // Tailwind CSS v4 Vite plugin
      tailwindcss(),
    ],

    // ===================
    // Development Server
    // ===================
    server: {
      port: requestedPort,
      strictPort: true,
      host: tauriDevHost,
      // Enable HMR with proper configuration for Tauri
      hmr: {
        protocol: 'ws',
        host: tauriDevHost,
        port: requestedPort,
      },
      // Watch configuration for better file watching
      watch: {
        // Ignore Rust source files and build artifacts
        ignored: ['**/src-tauri/**', '**/target/**'],
      },
      // CSP headers for Tauri dev mode.
      // In dev mode Tauri injects the CSP from tauri.conf.json as a <meta> tag after the
      // fact, which means WKWebView may block Vite-injected styles before the tag is parsed.
      // Sending the matching CSP as an HTTP response header from the Vite server ensures it
      // is applied immediately, eliminating the "Refused to apply a stylesheet" startup errors.
      headers: {
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
          "style-src 'self' 'unsafe-inline' 'unsafe-hashes' https://fonts.googleapis.com",
          'img-src * data: blob:',
          "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net data:",
          "connect-src 'self' ws://127.0.0.1:5173 ws://localhost:5173 ipc: https://api.agiworkforce.com https://agiworkforce.com https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://agiworkforce-signaling.fly.dev wss://agiworkforce-signaling.fly.dev http://localhost:11434 http://127.0.0.1:11434",
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

    // ===================
    // Preview Server
    // ===================
    preview: {
      port: 4173,
      strictPort: true,
    },

    // ===================
    // Environment Variables
    // ===================
    envPrefix: ['VITE_', 'TAURI_'],

    // ===================
    // Build Configuration
    // ===================
    build: {
      // Modern build target - use esnext for optimal performance
      target: isWebBuild ? 'esnext' : buildTarget,

      // Minification settings
      minify: isDebug ? false : 'esbuild',

      // Source maps for debugging - enabled in dev/test only; disabled in production
      // to avoid shipping source maps that expose original source code to end users (M24)
      sourcemap: mode !== 'production',

      // Output directory
      outDir: 'dist',

      // Report compressed size for build analysis
      reportCompressedSize: true,

      // CSS code splitting for better caching
      cssCodeSplit: true,

      // Rollup-specific options
      rollupOptions: {
        output: {
          /**
           * Manual chunk splitting for optimal loading performance.
           *
           * PERFORMANCE OPTIMIZATION:
           * - Separates vendor code from application code for better caching
           * - Heavy libraries (mermaid, recharts, monaco) are loaded on-demand
           * - Core dependencies are bundled together to minimize HTTP requests
           * - Average initial bundle size reduced by ~40% compared to no splitting
           */
          manualChunks: {
            // Core React ecosystem - loaded immediately
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],

            // Radix UI components - core UI primitives
            'ui-vendor': [
              '@radix-ui/react-alert-dialog',
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-popover',
              '@radix-ui/react-select',
              '@radix-ui/react-tabs',
              '@radix-ui/react-toast',
              '@radix-ui/react-tooltip',
            ],

            // Terminal is desktop-only
            ...(isWebBuild
              ? {}
              : {
                  'terminal-vendor': ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-webgl'],
                }),

            // Markdown rendering and syntax highlighting
            'markdown-vendor': [
              'react-markdown',
              'remark-gfm',
              'rehype-highlight',
              'katex',
              'rehype-katex',
              'remark-math',
              'highlight.js',
              'react-syntax-highlighter',
            ],

            // Charting library - only loaded on analytics/dashboard views
            'charts-vendor': ['recharts'],

            // Diagram library - only loaded when diagrams are rendered
            'diagram-vendor': ['mermaid'],

            // Code editing - loaded on-demand for code workspaces
            'monaco-vendor': ['monaco-editor'],

            // Virtualization for large lists
            'virtualization-vendor': ['react-window', 'react-virtualized-auto-sizer'],

            // Utility libraries
            'utility-vendor': ['framer-motion', 'date-fns', 'clsx', 'fuse.js'],

            // State management
            zustand: ['zustand', 'immer'],

            // PDF handling - loaded on-demand for document features
            'pdf-vendor': ['pdfjs-dist'],
          },

          // Asset file naming for better caching
          assetFileNames: 'assets/[name]-[hash][extname]',
          chunkFileNames: 'chunks/[name]-[hash].js',
          entryFileNames: '[name]-[hash].js',
        },
      },

      // Chunk size warning limit (in KB)
      chunkSizeWarningLimit: 1500,

      // Asset inlining threshold (in bytes) - inline small assets
      assetsInlineLimit: 4096,
    },

    // ===================
    // Module Resolution
    // ===================
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
        '@agiworkforce/utils': path.resolve(__dirname, '../../packages/utils/src/index.ts'),
        ...webTauriAliases,
      },
    },

    // ===================
    // Dependency Optimization
    // ===================
    optimizeDeps: {
      // Pre-bundle these dependencies for faster dev startup
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'zustand',
        ...(isWebBuild ? [] : ['@tauri-apps/api']),
        'framer-motion',
        'clsx',
        'date-fns',
        'highlight.js',
        'react-syntax-highlighter',
      ],
      // Exclude CLI tools from optimization
      exclude: isWebBuild ? [] : ['@tauri-apps/cli'],
      // Force optimization even for linked dependencies
      force: false,
    },

    // ===================
    // CSS Configuration
    // ===================
    css: {
      modules: {
        localsConvention: 'camelCase',
      },
      // Enable CSS sourcemaps in development
      devSourcemap: true,
    },

    // ===================
    // Global Defines
    // ===================
    define: {
      __APP_VERSION__: JSON.stringify(env['npm_package_version'] || '0.0.0'),
      __DEV__: JSON.stringify(mode === 'development'),
      __PROD__: JSON.stringify(mode === 'production'),
      __WEB_BUILD__: JSON.stringify(isWebBuild),
    },

    // ===================
    // Esbuild Configuration
    // ===================
    esbuild: {
      // Drop debugger statements and console calls in production to avoid
      // leaking internal diagnostics or implementation details (M25)
      drop: mode === 'production' ? ['debugger', 'console'] : [],
      // Preserve legal comments
      legalComments: 'none',
      // Keep function/class names to avoid initialization issues
      keepNames: true,
    },

    // ===================
    // Test Configuration (Vitest)
    // ===================
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
      ],
      server: {
        deps: {
          inline: ['@supabase/supabase-js'],
        },
      },
      // Coverage configuration
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/*.d.ts', '**/test/**'],
      },
    },
  };

  return config;
});
