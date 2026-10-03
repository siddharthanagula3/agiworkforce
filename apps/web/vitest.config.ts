import { defineConfig } from 'vitest/config';
import path from 'path';
import { availableParallelism, totalmem } from 'node:os';

const VITEST_WORKERS_ENV = 'AGI_VITEST_MAX_WORKERS';
const DEFAULT_VITEST_WORKERS = 2;

function vitestMaxWorkers(): number {
  const configured = Number(process.env[VITEST_WORKERS_ENV]);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_VITEST_WORKERS;
}

const maxWorkers = vitestMaxWorkers();

if (process.env['CI']) {
  process.stdout.write(
    `${JSON.stringify({ maxWorkers, availableParallelism: availableParallelism(), totalMemoryBytes: totalmem() })}\n`,
  );
}

export default defineConfig({
  plugins: [],
  test: {
    maxWorkers,
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/', '.next/', 'dist/', 'playwright.config.ts', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        'e2e/',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/__tests__/**',
        'next.config.ts',
        'tailwind.config.*',
        'postcss.config.*',
      ],
    },
    css: false,
    mockReset: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@shared': path.resolve(__dirname, './shared'),
      '@features': path.resolve(__dirname, './features'),
      '@webcontainer/api': path.resolve(__dirname, './test/__mocks__/webcontainer-api.ts'),
    },
  },
});
