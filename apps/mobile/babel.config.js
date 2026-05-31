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
          // Expo SDK 55 auto-discovers Reanimated 4 and injects
          // react-native-worklets/plugin. Keep that disabled in Jest.
          worklets: !isTest,
          reanimated: !isTest,
        },
      ],
      'nativewind/babel',
    ],
  };
};
