import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'tools/evals',
    // The semantic-decision bench is authored as .mts beside the runner it
    // scores, so its offline tests are picked up here rather than moved away.
    include: ['__tests__/**/*.test.ts', 'semantic-decisions/*.test.mts'],
  },
});
