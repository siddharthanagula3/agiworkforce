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
  billingEnabledFrom,
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
const FEATURE_FLAGS = readFileSync(`${REPO_ROOT}apps/mobile/lib/v1FeatureFlags.ts`, 'utf8');

function listingInputs(patch = {}) {
  return {
    ios: IOS_LISTING,
    android: ANDROID_LISTING,
    appVersion: appVersionFrom(APP_CONFIG),
    appIdentifier: appIdentifierFrom(APP_CONFIG),
    billingEnabled: billingEnabledFrom(FEATURE_FLAGS),
    ...patch,
  };
}

test('the committed store listings match the shipped build', () => {
  assert.deepEqual(storeListingFailures(listingInputs()), []);
  assert.equal(appVersionFrom(APP_CONFIG), IOS_LISTING._meta.version);
  assert.equal(billingEnabledFrom(FEATURE_FLAGS), false);
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
  const claiming = { ...IOS_LISTING, pricing: { ...IOS_LISTING.pricing, in_app_purchases: true } };
  assert.equal(storeListingFailures(listingInputs({ ios: claiming })).length, 1);
  assert.equal(storeListingFailures(listingInputs({ billingEnabled: true })).length, 1);
  assert.deepEqual(
    storeListingFailures(listingInputs({ ios: claiming, billingEnabled: true })),
    [],
  );
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
