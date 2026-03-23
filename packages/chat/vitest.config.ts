/**
 * Vitest configuration for @agiworkforce/chat
 *
 * Runs unit tests for the shared chat package (stores, utils, lib).
 * Uses jsdom environment because zustand stores use browser APIs.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
