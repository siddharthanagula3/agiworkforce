/**
 * Vitest configuration for @agiworkforce/runtime
 *
 * Runs pure TypeScript tests (no DOM / React needed) — the state package
 * uses only standard JS constructs compatible with Node environment.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
