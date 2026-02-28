module.exports = function (api) {
  // Cache the config per NODE_ENV so switching between test and non-test
  // environments produces distinct cached configs (important for CI).
  api.cache.using(() => process.env.NODE_ENV);
  const isTest = process.env.NODE_ENV === 'test';

  return {
    presets: [
      [
        'babel-preset-expo',
        {
          jsxImportSource: 'nativewind',
          // react-native-reanimated 3.16+ requires react-native-worklets as a peer dep
          // which is not installed as a real native module. babel-preset-expo
          // auto-discovers reanimated and adds its Babel plugin — disable that
          // auto-inclusion in Jest (NODE_ENV=test) to avoid worklets resolution errors.
          reanimated: !isTest,
        },
      ],
      'nativewind/babel',
    ],
    plugins: [
      // Only include the reanimated Babel plugin in production/development Metro builds,
      // not in Jest where react-native-worklets is unavailable as a native module.
      ...(isTest ? [] : ['react-native-reanimated/plugin']),
    ],
  };
};
