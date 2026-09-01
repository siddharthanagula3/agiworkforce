module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: [
    '/node_modules/',
    'scripts/screenshots/specs/',
    '__tests__/auth-401\\.test\\.ts$',
  ],
  setupFiles: ['./jest.setup.js'],
  setupFilesAfterEnv: ['./jest.after-setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/[^/]+/node_modules/)?(?:(?:jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|standard-navigation|@shopify/flash-list|@gorhom/bottom-sheet|nativewind|lucide-react-native|react-native-svg|react-native-reanimated|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|react-native-mmkv|zustand|@agiworkforce/design-tokens|@agiworkforce/artifacts|@agiworkforce/cloud-contracts|@agiworkforce/sync|@agiworkforce/trust-boundaries|uuid|decode-uri-component))',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^react$': '<rootDir>/node_modules/react',
    '^react-native$': '<rootDir>/node_modules/react-native',
    '^@agiworkforce/local-llm$': '<rootDir>/../../packages/platform/local-llm/src/index',
    '^@agiworkforce/artifacts$': '<rootDir>/../../packages/platform/artifacts/src/index',
    '^@agiworkforce/cloud-contracts$':
      '<rootDir>/../../packages/contracts/cloud-contracts/src/index',
    '^@agiworkforce/sync$': '<rootDir>/../../packages/client/sync/src/index',
    '^@agiworkforce/trust-boundaries$':
      '<rootDir>/../../packages/contracts/trust-boundaries/src/index',
    '^expo-clipboard$': '<rootDir>/__mocks__/expo-clipboard.js',
    '^expo-sqlite$': '<rootDir>/__mocks__/expo-sqlite.js',
    '^@react-native-community/netinfo$': '<rootDir>/__mocks__/netinfo.js',
  },
};
