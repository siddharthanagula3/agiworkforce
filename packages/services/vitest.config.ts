/**
 * Vitest configuration for @agiworkforce/services
 *
 * Runs pure TypeScript tests (no DOM / React needed) against the shared
 * service helpers exported from this package.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
  },
});
