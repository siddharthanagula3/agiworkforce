import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PINNED_BUILD_ENV,
  assertPinnedCocoaPods,
  assertPinnedImages,
  assertPinnedNodeToolchain,
  assertReproducibleNativeConfig,
} from './check-build-env.mjs';

function easJson(overrides = {}) {
  return {
    build: {
      base: {
        node: '24.18.0',
        pnpm: '9.15.3',
        ios: { image: PINNED_BUILD_ENV.iosImage },
        android: { image: PINNED_BUILD_ENV.androidImage, ndk: PINNED_BUILD_ENV.androidNdk },
        ...overrides.base,
      },
      production: { extends: 'base', ...overrides.production },
    },
  };
}

test('the pinned eas.json passes', () => {
  assertPinnedImages(easJson());
  assertPinnedNodeToolchain(easJson(), '24\n', { packageManager: 'pnpm@9.15.3' });
});

test('a floating runner image fails', () => {
  assert.throws(
    () => assertPinnedImages(easJson({ base: { ios: { image: 'latest' } } })),
    /floating "latest"/u,
  );
  assert.throws(
    () => assertPinnedImages(easJson({ base: { android: { image: 'sdk-57' } } })),
    /floating "sdk-57"/u,
  );
  assert.throws(
    () => assertPinnedImages(easJson({ base: { ios: {} } })),
    /is not set, so EAS picks the runner/u,
  );
});

test('a profile that overrides the pinned image fails', () => {
  assert.throws(
    () => assertPinnedImages(easJson({ production: { ios: { image: 'latest' } } })),
    /overrides the pinned runner image/u,
  );
});

test('an unpinned NDK fails', () => {
  assert.throws(
    () =>
      assertPinnedImages(
        easJson({ base: { android: { image: PINNED_BUILD_ENV.androidImage, ndk: '26.0.0' } } }),
      ),
    /reviewed NDK/u,
  );
});

test('a Node or pnpm that is not the repo toolchain fails', () => {
  assert.throws(
    () =>
      assertPinnedNodeToolchain(easJson({ base: { node: '22.11.0' } }), '24\n', {
        packageManager: 'pnpm@9.15.3',
      }),
    /not the repo's Node 24/u,
  );
  assert.throws(
    () =>
      assertPinnedNodeToolchain(easJson({ base: { node: 'latest' } }), '24\n', {
        packageManager: 'pnpm@9.15.3',
      }),
    /pin an exact X\.Y\.Z version/u,
  );
  assert.throws(
    () => assertPinnedNodeToolchain(easJson(), '24\n', { packageManager: 'pnpm@10.0.0' }),
    /the repo uses 10\.0\.0/u,
  );
});

test('an unpinned CocoaPods resolver fails', () => {
  assert.equal(
    assertPinnedCocoaPods(`PODFILE CHECKSUM: abc\n\nCOCOAPODS: ${PINNED_BUILD_ENV.cocoapods}\n`),
    `CocoaPods ${PINNED_BUILD_ENV.cocoapods} matches the pin`,
  );
  assert.throws(() => assertPinnedCocoaPods('COCOAPODS: 1.15.0\n'), /reviewed version is/u);
  assert.throws(() => assertPinnedCocoaPods('PODFILE CHECKSUM: abc\n'), /no COCOAPODS version/u);
});

test('a checkout without the generated iOS project says so instead of passing silently', () => {
  assert.match(assertPinnedCocoaPods(null), /not verified/u);
});

test('a native config that is not fingerprint-derived fails', () => {
  assertReproducibleNativeConfig({ runtimeVersion: { policy: 'fingerprint' } });
  assert.throws(
    () => assertReproducibleNativeConfig({ runtimeVersion: '1.2.0' }),
    /only "fingerprint"/u,
  );
  assert.throws(() => assertReproducibleNativeConfig({}), /only "fingerprint"/u);
});
