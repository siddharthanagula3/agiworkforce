import assert from 'node:assert/strict';
import { createPublicKey } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { extractStrings, looksBinary, readableText, scanText } from './artifact-scan.mjs';
import { diffEntitlements, entitlementViolations, parseEntitlements } from './entitlements.mjs';
import {
  manifestSchemaViolations,
  permissionDiff,
  permissionDiffViolations,
} from './chrome-manifest.mjs';
import {
  pinnedReleaseKeyFailures,
  pinnedReleaseKeys,
  releaseSigningKeyAssignment,
} from './pinned-release-keys.mjs';
import {
  appIdentifierFrom,
  appVersionFrom,
  NATIVE_PURCHASE_SOURCE_PATHS,
  nativePurchaseSupportFrom,
  storeListingFailures,
} from './store-listing.mjs';
import { collectFiles, scanArtifact } from '../../release/scan-release-artifact.mjs';

const REPO_ROOT = new URL('../../../', import.meta.url).pathname;

function fixtureDir() {
  return mkdtempSync(path.join(tmpdir(), 'release-guard-'));
}

test('an embedded provider secret fails the scan and is never printed in full', () => {
  const secret = `sk-ant-${'A'.repeat(40)}`;
  const findings = scanText(`const key = "${secret}";`, 'bundle.js');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'anthropic-key');
  assert.ok(!findings[0].detail.includes(secret));
});

test('every secret pattern is exercised by a fixture that fails it', () => {
  const fixtures = {
    'anthropic-key': `sk-ant-${'a'.repeat(40)}`,
    'openai-key': `sk-proj-${'A'.repeat(40)}`,
    'stripe-or-clerk-secret': `sk_live_${'a'.repeat(28)}`,
    'aws-access-key-id': 'AKIAIOSFODNN7EXAMPLE',
    'google-api-key': `AIza${'a'.repeat(35)}`,
    'github-token': `ghp_${'a'.repeat(36)}`,
    'github-fine-grained-token': `github_pat_${'a'.repeat(60)}`,
    'slack-token': `xoxb-${'1'.repeat(20)}`,
    'npm-token': `npm_${'a'.repeat(36)}`,
    'private-key-block': '-----BEGIN OPENSSH PRIVATE KEY-----',
  };
  for (const [rule, value] of Object.entries(fixtures)) {
    const rules = scanText(value, 'fixture').map((finding) => finding.rule);
    assert.ok(rules.includes(rule), `${rule} did not fire on its own fixture`);
  }
});

test('embedded updater and Apple signing credentials block release and are redacted', () => {
  for (const name of [
    'TAURI_SIGNING_PRIVATE_KEY',
    'TAURI_SIGNING_PRIVATE_KEY_PASSWORD',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APPLE_API_PRIVATE_KEY',
    'CSC_KEY_PASSWORD',
  ]) {
    const fixture = `${name}:"synthetic-signing-secret"`;
    const findings = scanText(fixture, 'app.asar', [fixture]);
    assert.equal(findings.length, 1, `${name} cannot be allowlisted`);
    assert.equal(findings[0].rule, 'embedded-signing-credential');
    assert.ok(!findings[0].detail.includes('synthetic-signing-secret'));
    assert.deepEqual(scanText(`process.env["${name}"]`, 'build.js'), []);
  }
});

test('a dev endpoint fails, and a loopback bind the desktop bridge needs does not', () => {
  assert.equal(scanText('https://abc123.ngrok-free.app/api', 'a.js')[0]?.rule, 'tunnel-host');
  assert.equal(scanText('http://localhost:3100/api/chat', 'a.js')[0]?.rule, 'dev-server-origin');
  assert.equal(
    scanText('https://agiworkforce-git-fix-branch.vercel.app', 'a.js')[0]?.rule,
    'preview-deploy-host',
  );
  assert.deepEqual(scanText('bind 127.0.0.1:0 then read the assigned port', 'bridge.rs'), []);
  assert.deepEqual(scanText('https://api.agiworkforce.com/v1/chat', 'a.js'), []);
});

test('an allowlisted public literal is not a finding', () => {
  const key = `AIza${'b'.repeat(35)}`;
  assert.equal(scanText(key, 'a.js').length, 1);
  assert.deepEqual(scanText(key, 'a.js', [key]), []);
});

test('a secret inside a binary is found through its printable strings', () => {
  const secret = `ghp_${'c'.repeat(36)}`;
  const binary = Buffer.concat([
    Buffer.from([0, 1, 2, 0]),
    Buffer.from(`padding ${secret} padding`),
    Buffer.from([0, 0]),
  ]);
  assert.equal(looksBinary(binary), true);
  assert.ok(extractStrings(binary).includes(secret));
  assert.equal(scanText(readableText(binary), 'agi').length, 1);
});

test('the scan walks a built bundle and fails on what it finds there', () => {
  const root = fixtureDir();
  writeFileSync(path.join(root, 'clean.js'), 'fetch("https://api.agiworkforce.com")');
  writeFileSync(path.join(root, 'leaky.js'), `const k = "AKIAIOSFODNN7EXAMPLE";`);
  assert.equal(collectFiles(root).length, 2);
  const findings = scanArtifact(root, []);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'aws-access-key-id');
  assert.deepEqual(
    scanArtifact(root, ['AKIAIOSFODNN7EXAMPLE']),
    [],
    'an allowlisted value clears the whole bundle scan',
  );
});

const BASELINE_PLIST = `<plist><dict>
<key>com.apple.security.network.client</key><true/>
<key>com.apple.security.cs.allow-jit</key><true/>
</dict></plist>`;

test('an entitlement added outside the baseline blocks the release', () => {
  const baseline = parseEntitlements(BASELINE_PLIST);
  assert.deepEqual(baseline, {
    'com.apple.security.network.client': true,
    'com.apple.security.cs.allow-jit': true,
  });

  const widened = parseEntitlements(
    `${BASELINE_PLIST.replace(
      '</dict>',
      '<key>com.apple.security.device.camera</key><true/></dict>',
    )}`,
  );
  assert.deepEqual(diffEntitlements(baseline, widened).granted, [
    'com.apple.security.device.camera',
  ]);
  assert.equal(entitlementViolations(baseline, widened).length, 1);
  assert.deepEqual(entitlementViolations(baseline, baseline), []);
});

test('an entitlement that defeats the hardened runtime is refused even if baselined', () => {
  const unsafe = { 'com.apple.security.cs.disable-library-validation': true };
  const violations = entitlementViolations(unsafe, unsafe);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /hardened runtime/u);
});

function manifest(patch = {}) {
  return {
    manifest_version: 3,
    name: 'AGI',
    version: '1.2.0',
    description: 'AGI in Chrome',
    permissions: ['storage'],
    host_permissions: ['https://agiworkforce.com/*'],
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
    background: { service_worker: 'src/background.js', type: 'module' },
    action: {},
    icons: {},
    ...patch,
  };
}

test('a malformed or over-reaching manifest fails schema validation', () => {
  assert.deepEqual(manifestSchemaViolations(manifest()), []);
  assert.ok(
    manifestSchemaViolations(manifest({ manifest_version: 2 })).some((violation) =>
      violation.includes('manifest_version'),
    ),
  );
  assert.ok(
    manifestSchemaViolations(manifest({ version: 'v1.2.0' })).some((violation) =>
      violation.includes('version must be'),
    ),
  );
  assert.ok(
    manifestSchemaViolations(manifest({ host_permissions: ['<all_urls>'] })).some((violation) =>
      violation.includes('blanket grant'),
    ),
  );
  assert.ok(
    manifestSchemaViolations(
      manifest({ content_security_policy: { extension_pages: "script-src 'unsafe-eval'" } }),
    ).some((violation) => violation.includes('script-src')),
  );
  assert.ok(
    manifestSchemaViolations(
      manifest({ background: { service_worker: 'src/background.js', type: 'classic' } }),
    ).some((violation) => violation.includes('background.type')),
  );
});

test('a permission the published release did not hold blocks the new one', () => {
  const published = manifest();
  const widened = manifest({
    permissions: ['storage', 'debugger'],
    host_permissions: ['https://agiworkforce.com/*', 'https://example.com/*'],
  });

  const diff = permissionDiff(published, widened);
  assert.deepEqual(diff.added.permissions, ['debugger']);
  assert.deepEqual(diff.added.host_permissions, ['https://example.com/*']);
  assert.equal(permissionDiffViolations(diff).length, 2);
  assert.equal(
    permissionDiffViolations(diff, [
      'permissions:debugger',
      'host_permissions:https://example.com/*',
    ]).length,
    0,
  );

  const narrowed = permissionDiff(widened, published);
  assert.deepEqual(narrowed.added, {});
  assert.deepEqual(permissionDiffViolations(narrowed), []);
});

test('a secret past the whole-file limit is still found, and reported once', () => {
  const root = fixtureDir();
  const secret = `AIza${'d'.repeat(35)}`;
  const padding = Buffer.alloc(9 * 1024 * 1024, 0x61);
  const file = path.join(root, 'huge.bin');
  writeFileSync(file, Buffer.concat([padding, Buffer.from(` ${secret} `), padding]));

  const findings = scanArtifact(root, []);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'google-api-key');
});

const IOS_LISTING = JSON.parse(
  readFileSync(`${REPO_ROOT}apps/mobile/store-listing/LISTING-METADATA-IOS.json`, 'utf8'),
);
const ANDROID_LISTING = JSON.parse(
  readFileSync(`${REPO_ROOT}apps/mobile/store-listing/LISTING-METADATA-ANDROID.json`, 'utf8'),
);
const APP_CONFIG = readFileSync(`${REPO_ROOT}apps/mobile/app.config.js`, 'utf8');
const NATIVE_PURCHASE_SOURCES = Object.fromEntries(
  Object.entries(NATIVE_PURCHASE_SOURCE_PATHS).map(([name, file]) => [
    name,
    readFileSync(`${REPO_ROOT}${file}`, 'utf8'),
  ]),
);

function listingInputs(patch = {}) {
  return {
    ios: IOS_LISTING,
    android: ANDROID_LISTING,
    appVersion: appVersionFrom(APP_CONFIG),
    appIdentifier: appIdentifierFrom(APP_CONFIG),
    nativePurchases: nativePurchaseSupportFrom(NATIVE_PURCHASE_SOURCES),
    ...patch,
  };
}

test('the committed store listings match the shipped build', () => {
  assert.deepEqual(storeListingFailures(listingInputs()), []);
  assert.equal(appVersionFrom(APP_CONFIG), IOS_LISTING._meta.version);
  assert.deepEqual(nativePurchaseSupportFrom(NATIVE_PURCHASE_SOURCES), {
    ios: true,
    android: true,
  });
  assert.ok(
    !Object.values(NATIVE_PURCHASE_SOURCE_PATHS).some((file) => file.endsWith('v1FeatureFlags.ts')),
  );
});

test('a listing that outran the build fails', () => {
  const failures = storeListingFailures(listingInputs({ appVersion: '9.9.9' }));
  assert.equal(failures.length, 2);
  assert.ok(
    failures.every((failure) =>
      failure.includes(`_meta.version is ${IOS_LISTING._meta.version} but the app ships 9.9.9`),
    ),
  );

  assert.equal(
    storeListingFailures(listingInputs({ appIdentifier: 'com.example.other' })).length,
    2,
  );
});

test('a recorded character count that is wrong fails', () => {
  const drifted = {
    ...IOS_LISTING,
    _meta: {
      ...IOS_LISTING._meta,
      char_counts: { ...IOS_LISTING._meta.char_counts, subtitle: 1 },
    },
  };
  const failures = storeListingFailures(listingInputs({ ios: drifted }));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /char_counts\.subtitle records 1/u);
});

test('copy over a store limit fails', () => {
  const over = {
    ...IOS_LISTING,
    subtitle: 'x'.repeat(40),
    _meta: {
      ...IOS_LISTING._meta,
      char_counts: { ...IOS_LISTING._meta.char_counts, subtitle: 40 },
    },
  };
  const failures = storeListingFailures(listingInputs({ ios: over }));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /over the 30 limit/u);
});

test('claiming purchases the build cannot make, or hiding ones it can, both fail', () => {
  const iosWithoutPurchases = {
    ...IOS_LISTING,
    pricing: { ...IOS_LISTING.pricing, in_app_purchases: false },
  };
  const androidWithoutPurchases = {
    ...ANDROID_LISTING,
    in_app_products: { ...ANDROID_LISTING.in_app_products, has_in_app_products: false },
  };
  for (const [platform, label, noPurchases] of [
    ['ios', 'iOS', iosWithoutPurchases],
    ['android', 'Android', androidWithoutPurchases],
  ]) {
    const hidden = storeListingFailures(listingInputs({ [platform]: noPurchases }));
    assert.equal(hidden.length, 1);
    assert.match(hidden[0], new RegExp(`${label} listing declares no purchases`));
    const unsupported = storeListingFailures(
      listingInputs({ nativePurchases: { ios: true, android: true, [platform]: false } }),
    );
    assert.equal(unsupported.length, 1);
    assert.match(
      unsupported[0],
      new RegExp(`${label} listing declares purchases without native purchase support`),
    );
  }
  assert.deepEqual(
    storeListingFailures(
      listingInputs({
        ios: iosWithoutPurchases,
        android: androidWithoutPurchases,
        nativePurchases: { ios: false, android: false },
      }),
    ),
    [],
  );
});

test('purchase declarations and verified platform support must be explicit booleans', () => {
  for (const value of [undefined, null, 'true', 1]) {
    assert.equal(
      storeListingFailures(listingInputs({ nativePurchases: { ios: value, android: true } }))
        .length,
      1,
    );
    assert.equal(
      storeListingFailures(listingInputs({ nativePurchases: { ios: true, android: value } }))
        .length,
      1,
    );
    assert.equal(
      storeListingFailures(
        listingInputs({ ios: { ...IOS_LISTING, pricing: { in_app_purchases: value } } }),
      ).length,
      1,
    );
    assert.equal(
      storeListingFailures(
        listingInputs({
          android: { ...ANDROID_LISTING, in_app_products: { has_in_app_products: value } },
        }),
      ).length,
      1,
    );
  }
});

test('missing native source owners and invalid manifests fail closed', () => {
  for (const name of Object.keys(NATIVE_PURCHASE_SOURCE_PATHS)) {
    assert.throws(
      () => nativePurchaseSupportFrom({ ...NATIVE_PURCHASE_SOURCES, [name]: '' }),
      /Native purchase wiring:/,
      name,
    );
  }
  assert.throws(
    () => nativePurchaseSupportFrom({ ...NATIVE_PURCHASE_SOURCES, package: '{invalid' }),
    /manifest is missing or invalid/,
  );
});

test('a missing runtime dependency or native plugin cannot be hidden by listing prose', () => {
  const manifest = JSON.parse(NATIVE_PURCHASE_SOURCES.package);
  delete manifest.dependencies['expo-iap'];
  assert.throws(
    () =>
      nativePurchaseSupportFrom({ ...NATIVE_PURCHASE_SOURCES, package: JSON.stringify(manifest) }),
    /runtime dependency is missing/,
  );
  assert.throws(
    () =>
      nativePurchaseSupportFrom({
        ...NATIVE_PURCHASE_SOURCES,
        appConfig: NATIVE_PURCHASE_SOURCES.appConfig.replace("'expo-iap',", "/* 'expo-iap', */"),
      }),
    /native plugin is missing/,
  );
});

test('only a direct native plugin entry or the first element of a plugin tuple registers IAP', () => {
  const entry = "    'expo-iap',";
  assert.ok(NATIVE_PURCHASE_SOURCES.appConfig.includes(entry));
  const tuple = NATIVE_PURCHASE_SOURCES.appConfig.replace(entry, "    ['expo-iap', {}],");
  assert.deepEqual(nativePurchaseSupportFrom({ ...NATIVE_PURCHASE_SOURCES, appConfig: tuple }), {
    ios: true,
    android: true,
  });
  for (const replacement of [
    "    { unused: 'expo-iap' },",
    "    ['other-plugin', { unused: 'expo-iap' }],",
    "    unusedPlugin('other-plugin', 'expo-iap'),",
    "    'expo-iap' + '-not-the-plugin',",
    "    ['expo-iap', {}] + '-not-a-tuple',",
  ]) {
    const appConfig = NATIVE_PURCHASE_SOURCES.appConfig.replace(entry, replacement);
    assert.throws(
      () => nativePurchaseSupportFrom({ ...NATIVE_PURCHASE_SOURCES, appConfig }),
      /native plugin is missing/,
    );
  }
});

test('canonical mobile capability and its exported surface mapping must both remain wired', () => {
  assert.throws(
    () =>
      nativePurchaseSupportFrom({
        ...NATIVE_PURCHASE_SOURCES,
        capabilities: NATIVE_PURCHASE_SOURCES.capabilities.replace(
          /(const MOBILE[\s\S]*?canUseBilling:) true/,
          '$1 false',
        ),
      }),
    /canonical mobile billing capability/,
  );
  assert.throws(
    () =>
      nativePurchaseSupportFrom({
        ...NATIVE_PURCHASE_SOURCES,
        capabilities: NATIVE_PURCHASE_SOURCES.capabilities.replace('mobile: MOBILE', 'mobile: WEB'),
      }),
    /canonical mobile capability export/,
  );
});

test('disabled or disconnected Billing purchase actions fail closed', () => {
  for (const [before, after] of [
    ['isClerkLoaded && isClerkSignedIn && isCloudModeActive', 'false'],
    ['isClerkLoaded && isClerkSignedIn && isCloudModeActive', 'FEATURES.billing'],
    ['useMobileIap', 'removedNativeHook'],
    ['nativeIap.purchase', 'nativeIap.removedPurchase'],
  ]) {
    const screen = NATIVE_PURCHASE_SOURCES.screen.replaceAll(before, after);
    assert.notEqual(screen, NATIVE_PURCHASE_SOURCES.screen);
    assert.throws(
      () => nativePurchaseSupportFrom({ ...NATIVE_PURCHASE_SOURCES, screen }),
      /Native purchase wiring:/,
    );
  }
});

test('native SDK, purchase requests and both store payloads must remain executable', () => {
  for (const [before, after] of [
    ['useIAP', 'removedIap'],
    ['iap.requestPurchase', 'iap.removedRequest'],
    ['apple:', 'removedApple:'],
    ['google:', 'removedGoogle:'],
    ['await fetchMobileIapCatalog(', 'await removedCatalog('],
    ['await verifyMobileIapPurchase(', 'await removedVerification('],
  ]) {
    const hook = NATIVE_PURCHASE_SOURCES.hook.replaceAll(before, after);
    assert.notEqual(hook, NATIVE_PURCHASE_SOURCES.hook);
    assert.throws(
      () => nativePurchaseSupportFrom({ ...NATIVE_PURCHASE_SOURCES, hook }),
      /Native purchase wiring:/,
    );
  }
  for (const hook of [
    `/* ${NATIVE_PURCHASE_SOURCES.hook} */`,
    `const example = ${JSON.stringify(NATIVE_PURCHASE_SOURCES.hook)};`,
    '/*' + NATIVE_PURCHASE_SOURCES.hook,
  ]) {
    assert.throws(
      () => nativePurchaseSupportFrom({ ...NATIVE_PURCHASE_SOURCES, hook }),
      /Native purchase wiring:/,
    );
  }
});

test('both platform catalog mappings and catalog/verification requests must remain reachable', () => {
  for (const [before, after] of [
    ["return 'ios';", 'return null;'],
    ["return 'android';", 'return null;'],
    ['/api/mobile/iap/catalog?', '/removed/catalog?'],
    ['/api/mobile/iap/verify', '/removed/verify'],
    ['/api/mobile/iap/verify', '/api/mobile/iap/verify-removed'],
  ]) {
    const service = NATIVE_PURCHASE_SOURCES.service.replace(before, after);
    assert.notEqual(service, NATIVE_PURCHASE_SOURCES.service);
    assert.throws(
      () => nativePurchaseSupportFrom({ ...NATIVE_PURCHASE_SOURCES, service }),
      /Native purchase wiring:/,
    );
  }
});

test('server catalog admission and verified purchase recording remain release prerequisites', () => {
  for (const [name, before, after] of [
    ['catalog', 'MOBILE_IAP_PRODUCT_DEFINITIONS.flatMap', 'removedDefinitions.flatMap'],
    ['catalog', '!deploymentEnablesMobileIap()', 'false'],
    [
      'catalogRoute',
      'getMobileIapCatalogState(parsed.data.platform)',
      'removedCatalog(parsed.data.platform)',
    ],
    ['verifyRoute', 'await verifyMobileIapPurchase(', 'await removedVerification('],
    ['verifyRoute', 'await recordVerifiedMobileIapPurchase(', 'await removedRecording('],
  ]) {
    const source = NATIVE_PURCHASE_SOURCES[name].replace(before, after);
    assert.notEqual(source, NATIVE_PURCHASE_SOURCES[name]);
    assert.throws(
      () => nativePurchaseSupportFrom({ ...NATIVE_PURCHASE_SOURCES, [name]: source }),
      /Native purchase wiring:/,
    );
  }
});

function publicKeyPem(jwk) {
  return createPublicKey({ format: 'jwk', key: jwk })
    .export({ type: 'spki', format: 'pem' })
    .trim();
}

const hexToBase64Url = (hex) => Buffer.from(hex, 'hex').toString('base64url');

const P256_PUBLIC_KEY = publicKeyPem({
  kty: 'EC',
  crv: 'P-256',
  x: hexToBase64Url('6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'),
  y: hexToBase64Url('4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5'),
});
const P384_PUBLIC_KEY = publicKeyPem({
  kty: 'EC',
  crv: 'P-384',
  x: hexToBase64Url(
    'aa87ca22be8b05378eb1c71ef320ad746e1d3b628ba79b9859f741e082542a385502f25dbf55296c3a545e3872760ab7',
  ),
  y: hexToBase64Url(
    '3617de4a96262c6f5d9e98bf9292dc29f8f41dbd289a147ce9da3113b5f0b8c00a60b1ce1d7e819d7a431d7c90ea0e5f',
  ),
});
const RSA_PUBLIC_KEY = publicKeyPem({
  kty: 'RSA',
  n: Buffer.alloc(256, 0xff).toString('base64url'),
  e: 'AQAB',
});

function installer(pinned) {
  return `#!/bin/bash\nTAG_PREFIX="v-cli-"\nRELEASE_SIGNING_KEY='${pinned}'\n\nVERSION=""\n`;
}

test('the committed installer still carries the assignment the key guard reads', () => {
  const committed = readFileSync(`${REPO_ROOT}apps/web/public/install.sh`, 'utf8');
  assert.notEqual(releaseSigningKeyAssignment(committed), null);
});

test('an installer with no pinned release key fails the key guard', () => {
  const failures = pinnedReleaseKeyFailures(installer(''));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /pins no public key/u);
  assert.equal(pinnedReleaseKeyFailures('#!/bin/bash\n').length, 1);
});

test('a pinned key the release job cannot sign for fails the key guard', () => {
  assert.match(pinnedReleaseKeyFailures(installer(RSA_PUBLIC_KEY)).join('\n'), /is rsa/u);
  assert.match(pinnedReleaseKeyFailures(installer(P384_PUBLIC_KEY)).join('\n'), /secp384r1/u);
  const garbled = P256_PUBLIC_KEY.replace(/\n[A-Za-z0-9+/]{8}/u, '\n!!!!!!!!');
  assert.match(pinnedReleaseKeyFailures(installer(garbled)).join('\n'), /not a readable/u);
});

test('a key outside the assignment is refused because the installer never reads it', () => {
  const source = `# ${P256_PUBLIC_KEY}\n${installer('')}`;
  assert.equal(pinnedReleaseKeys(source).length, 0);
  assert.ok(pinnedReleaseKeyFailures(source).some((failure) => /outside/u.test(failure)));
});

test('one or more pinned P-256 keys pass the key guard', () => {
  assert.deepEqual(pinnedReleaseKeyFailures(installer(P256_PUBLIC_KEY)), []);
  const rotation = installer(`${P256_PUBLIC_KEY}\n${P256_PUBLIC_KEY}`);
  assert.equal(pinnedReleaseKeys(rotation).length, 2);
  assert.deepEqual(pinnedReleaseKeyFailures(rotation), []);
});
