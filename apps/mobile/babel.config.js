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
    // Jest loads CommonJS, and without this a dynamic import() in source stays
    // native and throws in every test that reaches it.
    plugins: isTest ? ['@babel/plugin-transform-dynamic-import'] : [],
  };
};
