module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // react-native-reanimated/plugin is only required for production Metro builds.
      // In Jest (NODE_ENV=test) it tries to require react-native-worklets which is not
      // installed, causing "Cannot find module 'react-native-worklets/plugin'" errors.
      // jest-expo provides its own Reanimated mock so the plugin is not needed in tests.
      ...(process.env['NODE_ENV'] !== 'test' ? ['react-native-reanimated/plugin'] : []),
    ],
  };
};
