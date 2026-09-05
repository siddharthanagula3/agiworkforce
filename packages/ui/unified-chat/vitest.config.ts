import { defineConfig } from 'vitest/config';

const LOCAL_VITEST_WORKERS_ENV = 'AGI_VITEST_MAX_WORKERS';
const DEFAULT_LOCAL_VITEST_WORKERS = 2;

function localVitestMaxWorkers(): number | undefined {
  if (process.env['CI']) return undefined;
  const configured = Number(process.env[LOCAL_VITEST_WORKERS_ENV]);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_LOCAL_VITEST_WORKERS;
}

export default defineConfig({
  test: {
    maxWorkers: localVitestMaxWorkers(),
    environment: 'jsdom',
    globals: true,
    include: [
      'src/**/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.test.tsx',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
  },
});
