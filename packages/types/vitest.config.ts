/**
 * Vitest configuration for @agiworkforce/types
 *
 * Runs pure TypeScript tests (no DOM / React needed) against the shared
 * type helpers and schema utilities exported from this package.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
  },
});
