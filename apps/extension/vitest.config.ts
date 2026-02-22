import { defineConfig } from 'vitest/config';

export default defineConfig({
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
