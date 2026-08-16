module.exports = function (api) {
  api.cache.using(() => process.env.NODE_ENV);
  const isTest = process.env.NODE_ENV === 'test';

  return {
    presets: [
      [
        'babel-preset-expo',
        {
          jsxImportSource: 'nativewind',
          worklets: !isTest,
          reanimated: !isTest,
        },
      ],
      'nativewind/babel',
    ],
  };
};
