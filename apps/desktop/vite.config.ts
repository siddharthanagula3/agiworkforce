import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  // Test configuration
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/dist/**',
      ],
    },
  },
  plugins: [react()],

  // Prevent vite from obscuring rust errors
  clearScreen: false,

  server: {
    // Tauri expects a fixed port, fail if that port is not available
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 5173,
        }
      : false,
    watch: {
      // Tell vite to ignore watching src-tauri
      ignored: ['**/src-tauri/**'],
    },
  },

  preview: {
    port: 4173,
    strictPort: true,
  },

  // Environment variables
  envPrefix: ['VITE_', 'TAURI_'],

  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target:
      process.env['TAURI_PLATFORM'] === 'windows' ? 'chrome105' : 'safari13',
    // Don't minify for debug builds
    minify: !process.env['TAURI_DEBUG'] ? 'esbuild' : false,
    // Produce sourcemaps for debug builds
    sourcemap: Boolean(process.env['TAURI_DEBUG']),
    // Output directory
    outDir: 'dist',
    // Rollup options
    rollupOptions: {
      output: {
        // Manual chunks for better code splitting
        manualChunks: {
          // Vendor chunks
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': [
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
          ],
          'editor-vendor': ['@monaco-editor/react', 'monaco-editor'],
          'terminal-vendor': ['@xterm/xterm'],
          'zustand': ['zustand'],
        },
      },
    },
    // Chunk size warnings
    chunkSizeWarningLimit: 1000,
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
    },
  },

  optimizeDeps: {
    // Include dependencies that need to be pre-bundled
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'zustand',
      '@tauri-apps/api',
    ],
    exclude: ['@tauri-apps/cli'],
  },

  // CSS configuration
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
    postcss: './postcss.config.js',
  },

  // Define global constants
  define: {
    __APP_VERSION__: JSON.stringify(process.env['npm_package_version']),
  },
});
