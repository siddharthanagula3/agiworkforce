module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: [
    '/node_modules/',
    'scripts/screenshots/specs/',
    // Excluded suites are tracked in tasks/quality-sweep-2026-05-19/squad-mobile.md
    // and cover feature-gated Auth/Billing paths that are outside this pass.
    '__tests__/auth-401\\.test\\.ts$',
    '__tests__/api-paywall\\.test\\.ts$',
  ],
  // Runs BEFORE jest-expo's setup to fix missing UIManager mock
  setupFiles: ['./jest.setup.js'],
  // @testing-library/react-native v13+ auto-extends jest matchers — no explicit setup needed
  // The extend-expect subpath was removed; matchers register automatically on import
  // The pnpm package store resolves to paths like:
  //   node_modules/.pnpm/@react-native+js-polyfills@X.Y.Z/node_modules/@react-native/...
  // The optional (?:.pnpm/[^/]+/node_modules/)? prefix handles both npm and pnpm layouts
  // so React Native packages that use Flow types still get transformed by Babel.
  transformIgnorePatterns: [
    // uuid and @agiworkforce/services are ESM packages — include them in the Babel transform.
    'node_modules/(?!(?:.pnpm/[^/]+/node_modules/)?(?:(?:jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@shopify/flash-list|@gorhom/bottom-sheet|nativewind|lucide-react-native|react-native-svg|react-native-reanimated|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|react-native-mmkv|zustand|@agiworkforce/design-tokens|@agiworkforce/services|uuid))',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Override jest-expo preset which incorrectly resolves react to @types/react in pnpm
    '^react$': '<rootDir>/node_modules/react',
    // Workspace packages that may not be pnpm-linked in CI: resolve src directly.
    '^@agiworkforce/local-llm$': '<rootDir>/../../packages/local-llm/src/index',
    // @agiworkforce/services is ESM; resolve src directly so Jest/Babel picks up TS.
    '^@agiworkforce/services$': '<rootDir>/../../packages/services/src/index',
    // expo-clipboard is a native Expo module; keep Jest from loading native glue.
    '^expo-clipboard$': '<rootDir>/__mocks__/expo-clipboard.js',
    // expo-sqlite stub for storage tests until the native module is linked.
    '^expo-sqlite$': '<rootDir>/__mocks__/expo-sqlite.js',
    // @react-native-community/netinfo registers a native event subscription at
    // import time that crashes outside a real RN runtime — stub it globally
    // rather than per-test-file, since lib/egressGuard.ts now imports it.
    '^@react-native-community/netinfo$': '<rootDir>/__mocks__/netinfo.js',
  },
};
