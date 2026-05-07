/**
 * Vitest configuration for @agiworkforce/routing
 *
 * Pure-TS package — no DOM, no React. Heuristic classifier + Indic
 * detection are evaluated synchronously against fixed strings.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
  },
});
