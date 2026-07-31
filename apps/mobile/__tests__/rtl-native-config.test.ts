/* eslint-disable @typescript-eslint/no-require-imports */

describe('app.config.js — native RTL support', () => {
  it('enables native RTL without forcing every locale into RTL', () => {
    const { expo } = require('../app.config.js') as {
      expo: {
        plugins: Array<string | [string, { supportsRTL?: boolean; forcesRTL?: boolean }]>;
      };
    };
    const localization = expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-localization',
    );

    expect(localization).toEqual([
      'expo-localization',
      {
        supportsRTL: true,
        forcesRTL: false,
      },
    ]);
  });
});
