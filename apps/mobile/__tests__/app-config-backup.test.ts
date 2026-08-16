
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appConfig = require('../app.config.js') as {
  expo: {
    android?: { allowBackup?: boolean; package?: string };
    ios?: {
      bundleIdentifier?: string;
      associatedDomains?: string[];
      entitlements?: Record<string, unknown>;
    };
    runtimeVersion?: { policy?: string };
    updates?: { url?: string; fallbackToCacheTimeout?: number };
    extra?: { eas?: { projectId?: string } };
  };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const easConfig = require('../eas.json') as {
  build: Record<string, { channel?: string; extends?: string }>;
};

describe('app.config.js — Android backup is disabled', () => {
  it('explicitly sets allowBackup to false', () => {
    expect(appConfig.expo.android).toBeDefined();
    expect(appConfig.expo.android!.allowBackup).toBe(false);
  });

  it('Android package is the canonical bundle id (sanity)', () => {
    expect(appConfig.expo.android!.package).toBe('com.agiworkforce.app');
  });

  it('iOS bundle id is the canonical id (sanity)', () => {
    expect(appConfig.expo.ios!.bundleIdentifier).toBe('com.agiworkforce.app');
  });

  it('iOS app and Share Extension use the canonical shared-container group', () => {
    expect(appConfig.expo.ios!.entitlements?.['com.apple.security.application-groups']).toEqual([
      'group.com.agiworkforce.app.share',
    ]);
  });

  it('iOS advertises only the canonical non-redirecting App Link host', () => {
    const previousAppEnv = process.env['APP_ENV'];
    const previousClerkKey = process.env['EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY'];

    try {
      process.env['APP_ENV'] = 'production';
      process.env['EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY'] = 'pk_live_contract_test';
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const releaseConfig = require('../app.config.js') as typeof appConfig;
        expect(releaseConfig.expo.ios!.associatedDomains).toEqual(['applinks:agiworkforce.com']);
      });
    } finally {
      if (previousAppEnv === undefined) delete process.env['APP_ENV'];
      else process.env['APP_ENV'] = previousAppEnv;
      if (previousClerkKey === undefined) delete process.env['EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY'];
      else process.env['EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY'] = previousClerkKey;
    }
  });
});

describe('app.config.js — EAS Update compatibility', () => {
  it('targets the configured EAS project with a native fingerprint runtime', () => {
    const projectId = appConfig.expo.extra?.eas?.projectId;

    expect(projectId).toBe('38f0941c-88a7-468a-9750-fcd8b357ff4c');
    expect(appConfig.expo.updates).toEqual({
      url: `https://u.expo.dev/${projectId}`,
      fallbackToCacheTimeout: 0,
    });
    expect(appConfig.expo.runtimeVersion).toEqual({ policy: 'fingerprint' });
  });

  it('keeps every shippable EAS profile on an explicit update channel', () => {
    expect(easConfig.build.development?.channel).toBe('development');
    expect(easConfig.build.preview?.channel).toBe('preview');
    expect(easConfig.build['preview-simulator']?.extends).toBe('preview');
    expect(easConfig.build.beta?.channel).toBe('beta');
    expect(easConfig.build.production?.channel).toBe('production');
  });
});
