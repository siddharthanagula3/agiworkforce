import fs from 'fs';
import path from 'path';
import { PRODUCT_COPYRIGHT_NAME, PRODUCT_NAMES } from '@agiworkforce/types';
import { FEATURES } from '../lib/v1FeatureFlags';

const MOBILE_ROOT = path.join(__dirname, '..');
const FLAGS_PATH = path.join(MOBILE_ROOT, 'lib', 'v1FeatureFlags.ts');
const PAIRING_PATTERNS = ['/pair', '/pair/*'];
const pairingLinksOpen = FEATURES.companion && FEATURES.dispatch;

const AASA_SOURCE_PATH = path.join(
  __dirname,
  '..',
  '..',
  'web',
  'lib',
  'server',
  'mobile-app-association.ts',
);

function aasaClaimedPatterns(): string[] {
  const source = fs.readFileSync(AASA_SOURCE_PATH, 'utf8');
  const patterns = [...source.matchAll(/'\/':\s*'([^']+)'/gu)].map((match) => match[1] as string);
  expect(patterns.length).toBeGreaterThan(0);
  return patterns;
}

function androidPathAttributeFor(pattern: string): string {
  return pattern.endsWith('/*') ? pattern.slice(0, -1) : pattern;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const appConfig = require('../app.config.js') as {
  expo: {
    android: {
      intentFilters: Array<{
        action: string;
        autoVerify?: boolean;
        category?: string[];
        data?: Array<{
          mimeType?: string;
          scheme?: string;
          host?: string;
          path?: string;
          pathPrefix?: string;
          pathPattern?: string;
        }>;
      }>;
    };
  };
};

const filters = appConfig.expo.android.intentFilters;

describe('app.config.js, Android intentFilters use Expo short names', () => {
  it('never uses fully-qualified action/category names (prebuild adds the prefix)', () => {
    for (const filter of filters) {
      expect(filter.action).not.toMatch(/^android\.intent\./);
      for (const category of filter.category ?? []) {
        expect(category).not.toMatch(/^android\.intent\./);
      }
    }
  });

  it('declares a SEND share target for every type the composer accepts', () => {
    const send = filters.find((f) => f.action === 'SEND');
    expect(send).toBeDefined();
    expect(send!.category).toEqual(['DEFAULT']);
    expect(send!.data?.map((d) => d.mimeType)).toEqual([
      'text/plain',
      'text/*',
      'image/*',
      'application/pdf',
    ]);
  });

  it('declares a SEND_MULTIPLE target for the stream types, matching SEND', () => {
    const sendMultiple = filters.find((f) => f.action === 'SEND_MULTIPLE');
    expect(sendMultiple).toBeDefined();
    expect(sendMultiple!.category).toEqual(['DEFAULT']);
    expect(sendMultiple!.data?.map((d) => d.mimeType)).toEqual([
      'text/*',
      'image/*',
      'application/pdf',
    ]);
  });

  it('declares a text/plain PROCESS_TEXT selected-text action', () => {
    const processText = filters.find((f) => f.action === 'PROCESS_TEXT');
    expect(processText).toBeDefined();
    expect(processText!.category).toEqual(['DEFAULT']);
    expect(processText!.data?.map((d) => d.mimeType)).toEqual(['text/plain']);
  });

  it('declares the autoVerify VIEW App Link only for the canonical apex host', () => {
    const view = filters.find((f) => f.action === 'VIEW');
    expect(view).toBeDefined();
    expect(view!.autoVerify).toBe(true);
    expect(view!.category).toEqual(expect.arrayContaining(['DEFAULT', 'BROWSABLE']));
    expect(view!.data?.length).toBeGreaterThan(0);
    for (const entry of view!.data ?? []) {
      expect(entry.scheme).toBe('https');
      expect(entry.host).toBe('agiworkforce.com');
    }
  });

  it('scopes the App Link to the paths the app actually routes', () => {
    const view = filters.find((f) => f.action === 'VIEW');
    for (const entry of view!.data ?? []) {
      expect(entry.path ?? entry.pathPrefix ?? entry.pathPattern).toBeDefined();
    }

    const paths = (view!.data ?? []).map((d) => d.path ?? d.pathPrefix ?? d.pathPattern);
    const routed = aasaClaimedPatterns().filter(
      (pattern) => pairingLinksOpen || !PAIRING_PATTERNS.includes(pattern),
    );
    expect([...paths].sort()).toEqual(routed.map(androidPathAttributeFor).sort());
  });
});

describe('app.config.js, Android App Links for desktop pairing', () => {
  type Filters = typeof filters;

  const appLinkPathsWith = (flags: { companion: boolean; dispatch: boolean }) => {
    let source = fs.readFileSync(FLAGS_PATH, 'utf8');
    for (const [name, value] of Object.entries(flags)) {
      source = source.replace(
        new RegExp(`^(\\s*${name}:\\s*)(?:true|false)(,?)$`, 'm'),
        `$1${value}$2`,
      );
    }
    let viewFilters: Filters = [];
    jest.isolateModules(() => {
      const actualFs = jest.requireActual<typeof import('fs')>('fs');
      jest.doMock('fs', () => ({
        ...actualFs,
        readFileSync: (file: string, ...rest: unknown[]) =>
          file === FLAGS_PATH
            ? source
            : (actualFs.readFileSync as (...args: unknown[]) => unknown)(file, ...rest),
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      viewFilters = (require('../app.config.js') as typeof appConfig).expo.android.intentFilters;
    });
    jest.dontMock('fs');
    return (viewFilters.find((filter) => filter.action === 'VIEW')?.data ?? []).map(
      (entry) => entry.path ?? entry.pathPrefix ?? entry.pathPattern,
    );
  };

  it('leaves pairing links in the browser while Remote Control is off in this build', () => {
    expect(pairingLinksOpen).toBe(false);
    const paths = (filters.find((filter) => filter.action === 'VIEW')?.data ?? []).map(
      (entry) => entry.path ?? entry.pathPrefix,
    );
    expect(paths).not.toContain('/pair');
    expect(paths).not.toContain('/pair/');
  });

  it('claims pairing links only when both features the pairing handler needs are on', () => {
    const on = appLinkPathsWith({ companion: true, dispatch: true });
    expect(on).toEqual(expect.arrayContaining(['/pair', '/pair/', '/auth/reset-password']));

    for (const flags of [
      { companion: false, dispatch: false },
      { companion: true, dispatch: false },
      { companion: false, dispatch: true },
    ]) {
      const paths = appLinkPathsWith(flags);
      expect({ flags, pair: paths.filter((entry) => entry?.startsWith('/pair')) }).toEqual({
        flags,
        pair: [],
      });
      expect(paths).toContain('/auth/reset-password');
    }
  });
});

describe('app.config.js, the name Android shows', () => {
  type StringsJSON = { resources: { string?: Array<{ $: { name: string }; _: string }> } };
  type PrebuildConfig = Record<string, unknown> & {
    mods: {
      android: {
        strings: (config: Record<string, unknown>) => Promise<{ modResults: StringsJSON }>;
      };
    };
  };

  const templateStrings = (): StringsJSON => ({
    resources: { string: [{ $: { name: 'app_name' }, _: 'Hello App Display Name' }] },
  });

  const generatedAppName = async () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const prebuildConfig = require(
      require.resolve('@expo/prebuild-config', {
        paths: [path.dirname(require.resolve('expo/package.json'))],
      }),
    ) as {
      getPrebuildConfigAsync: (
        projectRoot: string,
        options: { platforms: string[] },
      ) => Promise<{ exp: PrebuildConfig }>;
    };
    const { exp } = await prebuildConfig.getPrebuildConfigAsync(MOBILE_ROOT, {
      platforms: ['android'],
    });
    const { modResults } = await exp.mods.android.strings({
      ...exp,
      modRawConfig: exp,
      modResults: templateStrings(),
      modRequest: {
        projectRoot: MOBILE_ROOT,
        platformProjectRoot: path.join(MOBILE_ROOT, 'android'),
        platform: 'android',
        modName: 'strings',
        introspect: true,
      },
    });
    return modResults.resources.string?.find((entry) => entry.$.name === 'app_name')?._;
  };

  it('labels the launcher icon and the text selection action with the store name', async () => {
    const storeName = `${PRODUCT_COPYRIGHT_NAME} ${PRODUCT_NAMES.mobile}`;
    const iosName = (appConfig.expo as { ios?: { infoPlist?: { CFBundleDisplayName?: string } } })
      .ios?.infoPlist?.CFBundleDisplayName;

    expect(iosName).toBe(storeName);
    expect(await generatedAppName()).toBe(storeName);
  }, 60_000);

  it('keeps the registry product name for the Expo app name and the native project', () => {
    expect((appConfig.expo as unknown as { name: string }).name).toBe(PRODUCT_NAMES.mobile);
  });
});
