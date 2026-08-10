/**
 * Vitest configuration for @agiworkforce/guardian-github
 *
 * Pure Node tests over webhook verification, event normalization, command
 * parsing, and Checks/PR publishing payload builders.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
  },
});
