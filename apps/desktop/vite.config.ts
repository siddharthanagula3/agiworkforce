import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import net from 'node:net';

const DEFAULT_DEV_PORT = Number(process.env['VITE_DEV_PORT'] ?? 5173);
const host = process.env['TAURI_DEV_HOST'];

async function findAvailablePort(port: number): Promise<number> {
  const tryPort = (candidate: number) =>
    new Promise<boolean>((resolve) => {
      const tester = net.createServer();
      tester.once('error', () => resolve(false));
      tester.once('listening', () => {
        tester.close(() => resolve(true));
      });
      tester.listen(candidate, '0.0.0.0');
    });

  let candidate = port;
  while (!(await tryPort(candidate))) {
    candidate += 1;
  }
  return candidate;
}

export default defineConfig(async () => {
  const resolvedPort = host ? DEFAULT_DEV_PORT : await findAvailablePort(DEFAULT_DEV_PORT);
  const portChanged = resolvedPort !== DEFAULT_DEV_PORT;

  if (portChanged) {
    console.warn(
      `[dev-server] Requested port ${DEFAULT_DEV_PORT} is busy. Using ${resolvedPort} instead. ` +
        'Set VITE_DEV_PORT or free the original port to change this behaviour.',
    );
  }

  const config: UserConfig = {
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
    clearScreen: false,
    server: {
      port: resolvedPort,
      strictPort: Boolean(host),
      host: host || false,
      hmr: host
        ? {
            protocol: 'ws',
            host,
            port: resolvedPort,
          }
        : false,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },
    preview: {
      port: 4173,
      strictPort: true,
    },
    envPrefix: ['VITE_', 'TAURI_'],
    build: {
      target: process.env['TAURI_PLATFORM'] === 'windows' ? 'chrome105' : 'safari13',
      minify: process.env['TAURI_DEBUG'] ? false : 'esbuild',
      sourcemap: Boolean(process.env['TAURI_DEBUG']),
      outDir: 'dist',
      rollupOptions: {
        output: {
          manualChunks: {
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
            zustand: ['zustand'],
          },
        },
      },
      chunkSizeWarningLimit: 3000,
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
        '@agiworkforce/utils': path.resolve(__dirname, '../../packages/utils/src/index.ts'),
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom', 'zustand', '@tauri-apps/api'],
      exclude: ['@tauri-apps/cli'],
    },
    css: {
      modules: {
        localsConvention: 'camelCase',
      },
      postcss: './postcss.config.js',
    },
    define: {
      __APP_VERSION__: JSON.stringify(process.env['npm_package_version']),
    },
  };

  return config;
});
