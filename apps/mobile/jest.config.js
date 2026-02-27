module.exports = {
  preset: 'jest-expo',
  // setupFilesAfterFramework was a typo — correct key is setupFilesAfterEnv
  setupFilesAfterEnv: ['@testing-library/react-native/extend-expect'],
  // The pnpm package store resolves to paths like:
  //   node_modules/.pnpm/@react-native+js-polyfills@X.Y.Z/node_modules/@react-native/...
  // The optional (?:.pnpm/[^/]+/node_modules/)? prefix handles both npm and pnpm layouts
  // so React Native packages that use Flow types still get transformed by Babel.
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/[^/]+/node_modules/)?(?:(?:jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@shopify/flash-list|@gorhom/bottom-sheet|@supabase/supabase-js|nativewind|lucide-react-native|react-native-svg|react-native-reanimated|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|react-native-mmkv|zustand))',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
