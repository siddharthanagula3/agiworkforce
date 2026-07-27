/* eslint-disable @typescript-eslint/no-require-imports */

describe('Clerk native authentication theme', () => {
  it('registers the AGI theme with the Expo plugin for both native platforms', () => {
    const { expo } = require('../app.config.js') as {
      expo: {
        plugins: Array<string | [string, { theme?: string }]>;
      };
    };
    const clerkPlugin = expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === '@clerk/expo',
    );

    expect(clerkPlugin).toEqual(['@clerk/expo', { theme: './clerk-theme.json' }]);

    const theme = require('../clerk-theme.json') as {
      colors?: Record<string, string>;
      darkColors?: Record<string, string>;
      design?: { borderRadius?: number };
    };
    const clerkPluginModule = require('@clerk/expo/app.plugin.js') as {
      _testing: { validateThemeJson: (value: unknown) => void };
    };

    expect(() => clerkPluginModule._testing.validateThemeJson(theme)).not.toThrow();
    expect(theme.colors?.primary).toBeDefined();
    expect(theme.darkColors?.primary).toBeDefined();
    expect(theme.design?.borderRadius).toBeGreaterThanOrEqual(12);
  });
});
