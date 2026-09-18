import assert from 'node:assert/strict';
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
      /_meta.version is 1\.2\.0 but the app ships 9\.9\.9/u.test(failure),
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
