import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'tools/evals',
    include: ['__tests__/**/*.test.ts'],
  },
});
