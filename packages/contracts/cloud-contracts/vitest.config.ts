/**
 * Vitest configuration for @agiworkforce/cloud-contracts.
 *
 * Runs the pure TypeScript wire-contract and typed-client tests in Node.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
