/* eslint-disable @typescript-eslint/no-require-imports */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { MOBILE_STORE_IDS, getStoreDistribution } from '@/src/features/release-state';

const MOBILE_ROOT = join(__dirname, '..');
const APP_CONFIG = (require('../app.config.js') as { expo: Record<string, never> }).expo;
const EAS = JSON.parse(readFileSync(join(MOBILE_ROOT, 'eas.json'), 'utf8')) as EasConfig;

interface BuildProfile {
  extends?: string;
  environment?: string;
  channel?: string;
  env?: Record<string, string>;
}

interface SubmitProfile {
  extends?: string;
  ios?: Record<string, string>;
  android?: Record<string, string>;
}

interface EasConfig {
  build: Record<string, BuildProfile>;
  submit: Record<string, SubmitProfile>;
}

function resolveBuild(name: string, seen = new Set<string>()): BuildProfile {
  const profile = EAS.build[name];
  if (profile === undefined || seen.has(name)) return {};
  seen.add(name);
  const parent = profile.extends === undefined ? {} : resolveBuild(profile.extends, seen);
  return {
    ...parent,
    ...profile,
    env: { ...(parent.env ?? {}), ...(profile.env ?? {}) },
  };
}

function resolveSubmit(name: string, seen = new Set<string>()): SubmitProfile {
  const profile = EAS.submit[name];
  if (profile === undefined || seen.has(name)) return {};
  seen.add(name);
  const parent = profile.extends === undefined ? {} : resolveSubmit(profile.extends, seen);
  return {
    ...parent,
    ...profile,
    ios: { ...(parent.ios ?? {}), ...(profile.ios ?? {}) },
    android: { ...(parent.android ?? {}), ...(profile.android ?? {}) },
  };
}

// "base" carries machine images only; a profile is shippable once it names the
// environment its build runs against.
const BUILD_PROFILES = Object.keys(EAS.build)
  .map((name) => ({ name, profile: resolveBuild(name) }))
  .filter(({ profile }) => profile.env?.APP_ENV !== undefined);

const NATIVE_IDENTIFIER: Readonly<Record<string, () => unknown>> = {
  apple: () => (APP_CONFIG.ios as Record<string, unknown>).bundleIdentifier,
  google: () => (APP_CONFIG.android as Record<string, unknown>).package,
};

describe('the identifiers a store binds a listing to', () => {
  it.each(MOBILE_STORE_IDS)('is one value for %s, taken from the release registry', (store) => {
    const registered = getStoreDistribution(store).productionId;

    expect(registered).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
    expect(NATIVE_IDENTIFIER[store]()).toBe(registered);
  });

  it('submits under the same identifier the binary is built with', () => {
    expect(resolveSubmit('production').ios?.bundleIdentifier).toBe(
      getStoreDistribution('apple').productionId,
    );
  });

  it('derives the share app group from the bundle identifier rather than typing it again', () => {
    const groups = (APP_CONFIG.ios as { entitlements: Record<string, string[]> }).entitlements[
      'com.apple.security.application-groups'
    ];

    expect(groups).toEqual([`group.${getStoreDistribution('apple').productionId}.share`]);
  });
});

describe('store credentials', () => {
  const CREDENTIAL_SHAPED =
    /-----BEGIN|"private_key"|\bsk_(live|test)_|\bAIza[0-9A-Za-z_-]{10}|\bpk_live_[0-9A-Za-z]/;

  it('appear nowhere in the config that becomes the binary', () => {
    const serialised = JSON.stringify(APP_CONFIG);

    expect(serialised.length).toBeGreaterThan(1000);
    expect(serialised).not.toMatch(CREDENTIAL_SHAPED);
  });

  it('are referenced by path or environment variable in every submit profile', () => {
    const references = Object.keys(EAS.submit).flatMap((name) => {
      const profile = resolveSubmit(name);
      return [...Object.entries(profile.ios ?? {}), ...Object.entries(profile.android ?? {})]
        .filter(([key]) => /KeyPath$|ApiKeyId$|IssuerId$|ServiceAccount/i.test(key))
        .map(([key, value]) => ({ name, key, value }));
    });

    expect(references.length).toBeGreaterThan(3);
    for (const { value } of references) {
      expect(value.startsWith('./secrets/') || value.startsWith('$')).toBe(true);
      expect(value).not.toMatch(CREDENTIAL_SHAPED);
    }
  });

  it('cannot be committed, because the key directory ignores everything in it', () => {
    expect(readFileSync(join(MOBILE_ROOT, 'secrets', '.gitignore'), 'utf8')).toMatch(/^\*$/m);

    const tracked = execFileSync('git', ['ls-files', 'apps/mobile/secrets'], {
      cwd: join(MOBILE_ROOT, '..', '..'),
      encoding: 'utf8',
    })
      .split('\n')
      .filter((line) => line.length > 0);

    expect(tracked.sort()).toEqual([
      'apps/mobile/secrets/.gitignore',
      'apps/mobile/secrets/.gitkeep',
    ]);
  });
});

describe('an over-the-air update', () => {
  it('cannot reach a binary whose native code differs, because the runtime version is a fingerprint', () => {
    expect(APP_CONFIG.runtimeVersion).toEqual({ policy: 'fingerprint' });
  });

  it('is served only by the EAS project this config declares', () => {
    const projectId = (APP_CONFIG.extra as { eas: { projectId: string } }).eas.projectId;

    expect((APP_CONFIG.updates as { url: string }).url).toBe(`https://u.expo.dev/${projectId}`);
  });

  // Two profiles may share a channel only where they build the same thing for a
  // different device, never where they point at a different backend.
  it('never lets one channel serve two environments, so a production update cannot land on a preview build', () => {
    const environmentsByChannel = new Map<string, Set<string>>();
    for (const { profile } of BUILD_PROFILES) {
      expect(profile.channel).toBeDefined();
      const channel = profile.channel as string;
      const seen = environmentsByChannel.get(channel) ?? new Set<string>();
      seen.add(profile.env?.APP_ENV as string);
      environmentsByChannel.set(channel, seen);
    }

    expect(environmentsByChannel.size).toBeGreaterThan(2);
    for (const [channel, environments] of environmentsByChannel) {
      expect({ channel, environments: [...environments] }).toEqual({
        channel,
        environments: [...environments].slice(0, 1),
      });
    }
  });
});

describe('which backend a build talks to', () => {
  it.each(BUILD_PROFILES)('is stated by $name rather than inherited by accident', ({ profile }) => {
    expect(profile.env?.APP_ENV).toBeDefined();
    expect(profile.env?.EXPO_PUBLIC_APP_ENV).toBe(profile.env?.APP_ENV);
    expect(profile.environment).toBe(profile.env?.APP_ENV);
  });

  it('is production for a profile named production and for no other', () => {
    const production = BUILD_PROFILES.filter(
      ({ profile }) => profile.env?.APP_ENV === 'production',
    ).map(({ name }) => name);

    expect(production).toEqual(['production']);
  });

  // A TestFlight or internal-track build may point at a staging backend, but
  // only where the profile says so and the submission cannot go public.
  it.each(Object.keys(EAS.submit))('keeps %s from publishing a non-production build', (name) => {
    const build = BUILD_PROFILES.find((candidate) => candidate.name === name);
    expect(build).toBeDefined();

    if (build?.profile.env?.APP_ENV === 'production') return;
    const android = resolveSubmit(name).android ?? {};
    expect(android.track).toBe('internal');
    expect(android.releaseStatus).toBe('draft');
  });
});
