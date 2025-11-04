import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [],
    include: [],
    passWithNoTests: true,
    coverage: {
      enabled: false,
    },
  },
});
