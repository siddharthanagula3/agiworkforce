import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANONICAL_IDENTITY,
  assertMonotonicRelease,
  assertProductionHardening,
  assertShareExtensionAlignment,
  assertStableIdentifiers,
  readReleaseNumbers,
} from './verify-release-integrity.mjs';

function productionConfig(overrides = {}) {
  return {
    slug: CANONICAL_IDENTITY.slug,
    scheme: CANONICAL_IDENTITY.scheme,
    version: '1.2.0',
    ios: {
      bundleIdentifier: CANONICAL_IDENTITY.iosBundleIdentifier,
      buildNumber: '2',
      associatedDomains: ['applinks:agiworkforce.com'],
      entitlements: {
        'com.apple.developer.siri': true,
        'com.apple.developer.natural-language.translation': true,
        'com.apple.security.application-groups': [CANONICAL_IDENTITY.appGroup],
      },
      ...overrides.ios,
    },
    android: { package: CANONICAL_IDENTITY.androidPackage, versionCode: 1, ...overrides.android },
    plugins: overrides.plugins ?? ['expo-router', ['expo-camera', {}]],
    extra: { eas: { projectId: CANONICAL_IDENTITY.easProjectId } },
  };
}

function productionEas(overrides = {}) {
  return {
    build: {
      production: {
        environment: 'production',
        channel: 'production',
        env: { APP_ENV: 'production', EXPO_PUBLIC_APP_ENV: 'production' },
        ios: { buildConfiguration: 'Release', credentialsSource: 'remote' },
        android: { buildType: 'app-bundle' },
        ...overrides.build,
      },
    },
    submit: {
      production: {
        ios: { bundleIdentifier: CANONICAL_IDENTITY.iosBundleIdentifier },
        android: { track: 'internal' },
        ...overrides.submit,
      },
    },
  };
}

function extensionInputs(overrides = {}) {
  return {
    buildSettings: {
      MARKETING_VERSION: '"1.2.0"',
      CURRENT_PROJECT_VERSION: '"2"',
      PRODUCT_BUNDLE_IDENTIFIER: `"${CANONICAL_IDENTITY.iosBundleIdentifier}.share-extension"`,
      ...overrides.buildSettings,
    },
    infoPlist:
      overrides.infoPlist ??
      '<string>$(MARKETING_VERSION)</string><string>$(CURRENT_PROJECT_VERSION)</string>',
    entitlements:
      overrides.entitlements ?? `<array><string>${CANONICAL_IDENTITY.appGroup}</string></array>`,
    source:
      overrides.source ??
      'let container = fileManager.containerURL(forSecurityApplicationGroupIdentifier: group)',
    hostVersion: overrides.hostVersion ?? '1.2.0',
    hostBuildNumber: overrides.hostBuildNumber ?? '2',
  };
}

test('the shipped configuration passes every identity check', () => {
  assertStableIdentifiers(productionConfig());
  assertProductionHardening(productionConfig(), productionEas());
  assertShareExtensionAlignment(extensionInputs());
});

test('a changed bundle identifier fails', () => {
  assert.throws(
    () =>
      assertStableIdentifiers(
        productionConfig({ ios: { bundleIdentifier: 'com.agiworkforce.app2' } }),
      ),
    /ios\.bundleIdentifier/u,
  );
});

test('a changed Android package or app group fails', () => {
  assert.throws(
    () => assertStableIdentifiers(productionConfig({ android: { package: 'com.other.app' } })),
    /android\.package/u,
  );
  assert.throws(
    () =>
      assertStableIdentifiers(
        productionConfig({
          ios: { entitlements: { 'com.apple.security.application-groups': ['group.com.other'] } },
        }),
      ),
    /application-groups/u,
  );
});

test('an unreviewed entitlement fails', () => {
  const config = productionConfig();
  config.ios.entitlements['com.apple.developer.healthkit'] = true;

  assert.throws(
    () => assertProductionHardening(config, productionEas()),
    /unreviewed iOS entitlements/u,
  );
});

test('a dev menu or Detox plugin reaching production fails', () => {
  assert.throws(
    () =>
      assertProductionHardening(
        productionConfig({ plugins: ['./native/android/withAGIDetox.cjs'] }),
        productionEas(),
      ),
    /withAGIDetox/u,
  );
  assert.throws(
    () =>
      assertProductionHardening(
        productionConfig(),
        productionEas({ build: { developmentClient: true } }),
      ),
    /ships the dev menu/u,
  );
});

test('a production profile that would not produce a signed store archive fails', () => {
  assert.throws(
    () =>
      assertProductionHardening(
        productionConfig(),
        productionEas({ build: { ios: { buildConfiguration: 'Debug' } } }),
      ),
    /not a Release build/u,
  );
  assert.throws(
    () =>
      assertProductionHardening(
        productionConfig(),
        productionEas({
          build: { ios: { buildConfiguration: 'Release', credentialsSource: 'local' } },
        }),
      ),
    /managed EAS credentials/u,
  );
  assert.throws(
    () =>
      assertProductionHardening(
        productionConfig(),
        productionEas({ build: { android: { buildType: 'apk' } } }),
      ),
    /does not build an AAB/u,
  );
  assert.throws(
    () =>
      assertProductionHardening(
        productionConfig(),
        productionEas({ build: { env: { APP_ENV: 'preview' } } }),
      ),
    /APP_ENV=production/u,
  );
  assert.throws(
    () =>
      assertProductionHardening(
        productionConfig(),
        productionEas({ submit: { ios: { bundleIdentifier: 'com.other.app' } } }),
      ),
    /canonical id/u,
  );
});

test('a deep-link domain that is not ours fails', () => {
  assert.throws(
    () =>
      assertProductionHardening(
        productionConfig({ ios: { associatedDomains: ['applinks:example.com'] } }),
        productionEas(),
      ),
    /associatedDomains/u,
  );
});

test('a share extension pinned to its own version fails', () => {
  assert.throws(
    () =>
      assertShareExtensionAlignment(
        extensionInputs({ buildSettings: { MARKETING_VERSION: '"1.0.0"' } }),
      ),
    /MARKETING_VERSION/u,
  );
  assert.throws(
    () => assertShareExtensionAlignment(extensionInputs({ infoPlist: '<string>1.2.0</string>' })),
    /literal version/u,
  );
});

test('a share extension that reaches for a credential or the network fails', () => {
  assert.throws(
    () =>
      assertShareExtensionAlignment(
        extensionInputs({ source: 'URLSession.shared.dataTask(with: request)' }),
      ),
    /network access/u,
  );
  assert.throws(
    () =>
      assertShareExtensionAlignment(
        extensionInputs({
          source: 'request.setValue("Bearer \\(token)", forHTTPHeaderField: "Authorization")',
        }),
      ),
    /bearer token/u,
  );
});

test('a share extension granted more than the app group fails', () => {
  assert.throws(
    () =>
      assertShareExtensionAlignment(
        extensionInputs({
          entitlements: `<array><string>${CANONICAL_IDENTITY.appGroup}</string><string>group.com.other</string></array>`,
        }),
      ),
    /must grant only the app group/u,
  );
});

test('release numbering may only move forward', () => {
  const previous = { version: '1.2.0', buildNumber: '2', versionCode: 1 };

  assertMonotonicRelease(previous, { version: '1.3.0', buildNumber: '3', versionCode: 2 });

  assert.throws(
    () => assertMonotonicRelease(previous, { version: '1.1.9', buildNumber: '3', versionCode: 2 }),
    /version went backwards/u,
  );
  assert.throws(
    () => assertMonotonicRelease(previous, { version: '1.2.0', buildNumber: '3', versionCode: 2 }),
    /already released/u,
  );
  assert.throws(
    () => assertMonotonicRelease(previous, { version: '1.3.0', buildNumber: '1', versionCode: 2 }),
    /buildNumber went backwards/u,
  );
  assert.throws(
    () => assertMonotonicRelease(previous, { version: '1.3.0', buildNumber: '3', versionCode: 0 }),
    /versionCode went backwards/u,
  );
});

test('the release numbers are read from the app config that ships', () => {
  const numbers = readReleaseNumbers(
    "const config = {\n  version: '1.2.0',\n  ios: { buildNumber: '2' },\n  android: { versionCode: 1 },\n};",
  );

  assert.deepEqual(numbers, { version: '1.2.0', buildNumber: '2', versionCode: '1' });
  assert.throws(() => readReleaseNumbers('const config = {};'), /could not read expo\.version/u);
});
