/**
 * Vitest configuration for @agiworkforce/data-layer
 *
 * Pure node tests against the adapter factory and provider wrappers.
 * Adapter implementations are unit-tested with mocked vendor clients —
 * we never reach a real Neon / Postgres backend in CI.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
  },
});
