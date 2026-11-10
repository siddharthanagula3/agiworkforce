function dynamicImportToRequire({ types: t, template }) {
  const load = template.expression(`
    Promise.resolve().then(() => {
      const loaded = require(SPECIFIER);
      return loaded && loaded.__esModule ? loaded : Object.assign({ default: loaded }, loaded);
    })
  `);
  return {
    name: 'dynamic-import-to-require',
    visitor: {
      CallExpression(path) {
        if (!t.isImport(path.node.callee)) return;
        path.replaceWith(load({ SPECIFIER: path.node.arguments[0] }));
      },
    },
  };
}

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
    plugins: isTest ? [dynamicImportToRequire] : [],
  };
};
