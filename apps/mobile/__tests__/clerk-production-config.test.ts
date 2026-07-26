/* eslint-disable @typescript-eslint/no-require-imports */
describe('Mobile Clerk publishable-key configuration', () => {
  const originalConfigAppEnv = process.env.APP_ENV;
  const originalAppEnv = process.env.EXPO_PUBLIC_APP_ENV;
  const originalPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

  afterEach(() => {
    jest.resetModules();

    if (originalConfigAppEnv === undefined) {
      delete process.env.APP_ENV;
    } else {
      process.env.APP_ENV = originalConfigAppEnv;
    }

    if (originalAppEnv === undefined) {
      delete process.env.EXPO_PUBLIC_APP_ENV;
    } else {
      process.env.EXPO_PUBLIC_APP_ENV = originalAppEnv;
    }

    if (originalPublishableKey === undefined) {
      delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    } else {
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = originalPublishableKey;
    }
  });

  it('uses the configured live key in production', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_live_release_key';

    jest.isolateModules(() => {
      const { CLERK_PUBLISHABLE_KEY } = require('../src/integrations/clerk') as {
        CLERK_PUBLISHABLE_KEY: string;
      };

      expect(CLERK_PUBLISHABLE_KEY).toBe('pk_live_release_key');
    });
  });

  it.each(['production', 'preview'])(
    'rejects a Clerk development key in the %s environment',
    (appEnv) => {
      process.env.EXPO_PUBLIC_APP_ENV = appEnv;
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_development_key';

      expect(() => {
        jest.isolateModules(() => {
          require('../src/integrations/clerk');
        });
      }).toThrow(/live Clerk publishable key/i);
    },
  );

  it('stops Expo production configuration before a development key can be bundled', () => {
    process.env.APP_ENV = 'production';
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_development_key';

    expect(() => {
      jest.isolateModules(() => {
        require('../app.config.js');
      });
    }).toThrow(/live Clerk publishable key/i);
  });
});
