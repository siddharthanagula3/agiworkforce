import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    // Webview-rendering tests need jsdom and live in vitest.webview.config.ts.
    exclude: ['**/node_modules/**', '**/*.webview.test.ts'],
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'src/__tests__/__mocks__/vscode.ts'),
    },
  },
});
