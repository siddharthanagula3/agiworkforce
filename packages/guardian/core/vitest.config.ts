/**
 * Vitest configuration for @agiworkforce/guardian-core
 *
 * Pure Node tests over the Guardian finding schema, fingerprinting, config,
 * verification, deduplication, ranking, policy, and scanner adapters.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
  },
});
