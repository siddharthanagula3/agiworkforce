module.exports = function (api) {
  api.cache(true);
  const isTest = process.env['NODE_ENV'] === 'test';
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          jsxImportSource: 'nativewind',
          // react-native-reanimated 3.16+ requires react-native-worklets as a peer dep
          // which is not installed. babel-preset-expo auto-discovers reanimated and adds
          // its Babel plugin — disable that auto-inclusion in Jest (NODE_ENV=test).
          reanimated: !isTest,
        },
      ],
      'nativewind/babel',
    ],
    plugins: [
      // Only include the reanimated Babel plugin in production/development Metro builds,
      // not in Jest where react-native-worklets is unavailable.
      ...(isTest ? [] : ['react-native-reanimated/plugin']),
    ],
  };
};
