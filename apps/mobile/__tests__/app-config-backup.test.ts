import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

describe('app.config.js, Android backup is disabled', () => {
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
    const previousApiUrl = process.env['EXPO_PUBLIC_API_URL'];

    try {
      process.env['APP_ENV'] = 'production';
      process.env['EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY'] = 'pk_live_contract_test';
      process.env['EXPO_PUBLIC_API_URL'] = 'https://agiworkforce.com';
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const releaseConfig = require('../app.config.js') as typeof appConfig;
        expect(releaseConfig.expo.ios!.associatedDomains).toEqual([
          'applinks:agiworkforce.com',
          'webcredentials:agiworkforce.com',
        ]);
      });
    } finally {
      if (previousAppEnv === undefined) delete process.env['APP_ENV'];
      else process.env['APP_ENV'] = previousAppEnv;
      if (previousClerkKey === undefined) delete process.env['EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY'];
      else process.env['EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY'] = previousClerkKey;
      if (previousApiUrl === undefined) delete process.env['EXPO_PUBLIC_API_URL'];
      else process.env['EXPO_PUBLIC_API_URL'] = previousApiUrl;
    }
  });
});

describe('app.config.js, EAS Update compatibility', () => {
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

describe('app.config.js, nothing device-bound leaves the phone through Android backup', () => {
  type ManifestApplication = { $: Record<string, string> };
  type AndroidManifest = {
    manifest: { $: Record<string, string>; application: ManifestApplication[] };
  };
  const mobileRoot = join(__dirname, '..');
  const PRODUCTION_ENV = {
    APP_ENV: 'production',
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_contract_test',
    EXPO_PUBLIC_API_URL: 'https://agiworkforce.com',
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const packageJson = require('../package.json') as { dependencies?: Record<string, string> };
  const DEVICE_BOUND_DOMAINS = [
    'root',
    'file',
    'database',
    'external',
    'device_root',
    'device_file',
    'device_database',
  ];

  const productionApplication = async (): Promise<Record<string, string>> => {
    const previous = Object.fromEntries(
      Object.keys(PRODUCTION_ENV).map((name) => [name, process.env[name]]),
    );
    Object.assign(process.env, PRODUCTION_ENV);
    try {
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const prebuildConfig = require(
        require.resolve('@expo/prebuild-config', {
          paths: [dirname(require.resolve('expo/package.json'))],
        }),
      ) as {
        getPrebuildConfigAsync: (
          projectRoot: string,
          options: { platforms: string[] },
        ) => Promise<{
          exp: Record<string, unknown> & {
            mods: {
              android: {
                manifest: (config: Record<string, unknown>) => Promise<{
                  modResults: AndroidManifest;
                }>;
              };
            };
          };
        }>;
      };
      const { exp } = await prebuildConfig.getPrebuildConfigAsync(mobileRoot, {
        platforms: ['android'],
      });
      const template: AndroidManifest = {
        manifest: {
          $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
          application: [
            {
              $: { 'android:name': '.MainApplication' },
              activity: [
                {
                  $: { 'android:name': '.MainActivity', 'android:launchMode': 'singleTask' },
                  'intent-filter': [
                    {
                      action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
                      category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
                    },
                  ],
                },
              ],
            } as ManifestApplication,
          ],
        },
      };
      const { modResults } = await exp.mods.android.manifest({
        ...exp,
        modRawConfig: exp,
        modResults: template,
        modRequest: {
          projectRoot: mobileRoot,
          platformProjectRoot: join(mobileRoot, 'android'),
          platform: 'android',
          modName: 'manifest',
          introspect: true,
        },
      });
      return modResults.manifest.application[0]!.$;
    } finally {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  };

  const xmlResource = (reference: string): string => {
    const name = /^@xml\/([a-z0-9_]+)$/.exec(reference)?.[1];
    expect([reference, name]).toEqual([reference, expect.any(String)]);
    const candidates = Object.keys(packageJson.dependencies ?? {})
      .map((dependency) =>
        join(mobileRoot, 'node_modules', dependency, 'android/src/main/res/xml', `${name}.xml`),
      )
      .filter((file) => existsSync(file));
    expect([reference, candidates.length]).toEqual([reference, 1]);
    return readFileSync(candidates[0]!, 'utf8');
  };

  const includedDomains = (rules: string, section: string): string[] | null => {
    const body = new RegExp(`<${section}[^>]*>([\\s\\S]*?)</${section}>`).exec(rules)?.[1];
    if (body === undefined) return null;
    return [...body.matchAll(/<include\s+domain="([^"]+)"/g)].map(([, domain]) => domain!);
  };

  const sendsNothingDeviceBound = (rules: string, section: string): boolean => {
    const included = includedDomains(rules, section);
    return (
      included !== null &&
      included.length > 0 &&
      included.every((domain) => !DEVICE_BOUND_DOMAINS.includes(domain))
    );
  };

  it('reads a missing section or an exclude-only section as sending everything', () => {
    const excludeOnly =
      '<data-extraction-rules><device-transfer><exclude domain="file" path="models"/></device-transfer></data-extraction-rules>';
    expect(sendsNothingDeviceBound(excludeOnly, 'device-transfer')).toBe(false);
    expect(sendsNothingDeviceBound(excludeOnly, 'cloud-backup')).toBe(false);
    expect(
      sendsNothingDeviceBound(
        '<data-extraction-rules><cloud-backup><include domain="sharedpref" path="."/></cloud-backup></data-extraction-rules>',
        'cloud-backup',
      ),
    ).toBe(true);
  });

  it('keeps model files and the Local database out of cloud backup and device transfer', async () => {
    const application = await productionApplication();

    expect(application['android:allowBackup']).toBe('false');
    const rules = xmlResource(application['android:dataExtractionRules'] ?? '');
    expect(sendsNothingDeviceBound(rules, 'cloud-backup')).toBe(true);
    expect(sendsNothingDeviceBound(rules, 'device-transfer')).toBe(true);
    expect(rules).toMatch(/<exclude domain="sharedpref" path="SecureStore"\/>/);
  }, 60_000);
});
