/**
 * Vitest configuration for @agiworkforce/licensing
 *
 * Pure Node tests (no DOM). Exercises offline license verification against the
 * committed cross-language fixture corpus.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
