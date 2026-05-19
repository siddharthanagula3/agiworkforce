/**
 * vitest.webview.config.ts — jsdom-based tests for webview HTML rendering.
 *
 * Catches bugs like F-01 (TypeScript syntax embedded in webview JS script
 * body) that the node-environment vitest config in vitest.config.ts cannot
 * detect because it never parses the rendered HTML.
 *
 * Run with: pnpm test:webview
 * Or all:   pnpm test && pnpm test:webview
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.webview.test.ts'],
    exclude: ['**/node_modules/**'],
    environment: 'jsdom',
    globals: false,
  },
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'src/__tests__/__mocks__/vscode.ts'),
    },
  },
});
