import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  plugins: [],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/', '.next/', 'dist/', 'playwright.config.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        'e2e/',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/__tests__/**',
        'next.config.ts',
        'tailwind.config.*',
        'postcss.config.*',
      ],
    },
    // Disable CSS injection in jsdom to prevent motion-dom CSS rendering errors.
    // motion-dom tries to set CSS transforms (e.g. translateX, opacity) via
    // jsdom's cssstyle parser, which throws:
    //   TypeError: Cannot read properties of undefined (reading 'split')
    // Setting css to false prevents Vitest from processing CSS imports, and the
    // framer-motion mock in test/setup.ts replaces motion components with plain
    // DOM elements to avoid the cssstyle interaction entirely.
    css: false,
    mockReset: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@shared': path.resolve(__dirname, './shared'),
      '@core': path.resolve(__dirname, './core'),
      '@features': path.resolve(__dirname, './features'),
      // Stub for packages not installed (browser-only, require special runtime env)
      '@webcontainer/api': path.resolve(__dirname, './test/__mocks__/webcontainer-api.ts'),
    },
  },
});
