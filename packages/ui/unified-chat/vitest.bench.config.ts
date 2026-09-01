import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.bench.ts'],
    disableConsoleIntercept: true,
  },
});
