/**
 * Vitest configuration for @agiworkforce/utils
 *
 * Pure Node tests over the shared utility helpers exported from this package.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      thresholds: { lines: 66 },
    },
  },
});
