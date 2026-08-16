import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      'webextension-polyfill': fileURLToPath(
        new URL('./__tests__/webextension-polyfill.mock.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'https://acme.myworkdayjobs.com/en-US/careers',
      },
    },
    include: ['__tests__/**/*.test.ts'],
    restoreMocks: true,
  },
});
