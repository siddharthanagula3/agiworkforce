import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  compareDataSafety,
  compareManifests,
  parsePrivacyManifest,
} from './verify-privacy-declarations.mjs';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestXml = fs.readFileSync(
  path.join(mobileRoot, 'store-listing/ios/PrivacyInfo.xcprivacy'),
  'utf8',
);
const manifest = parsePrivacyManifest(manifestXml);
const dataSafety = JSON.parse(
  fs.readFileSync(path.join(mobileRoot, 'store-listing/android/data-safety.json'), 'utf8'),
);

function runReleaseGuard(input, pathValue = process.env.PATH) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agi-privacy-declarations-')));
  try {
    for (const directory of ['scripts/release', 'store-listing/ios', 'store-listing/android']) {
      fs.mkdirSync(path.join(root, directory), { recursive: true });
    }
    for (const file of [
      'app.config.js',
      'scripts/release/verify-privacy-declarations.mjs',
      'store-listing/android/data-safety.json',
    ]) {
      fs.copyFileSync(path.join(mobileRoot, file), path.join(root, file));
    }
    const parser = 'scripts/release/parse-privacy-manifest.py';
    if (fs.existsSync(path.join(mobileRoot, parser))) {
      fs.copyFileSync(path.join(mobileRoot, parser), path.join(root, parser));
    }
    fs.writeFileSync(path.join(root, 'store-listing/ios/PrivacyInfo.xcprivacy'), input);
    return spawnSync(
      process.execPath,
      [path.join(root, 'scripts/release/verify-privacy-declarations.mjs')],
      {
        cwd: root,
        env: { PATH: pathValue, EXPO_PUBLIC_API_URL: 'https://example.invalid' },
        encoding: 'utf8',
        timeout: 15000,
      },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const trackingFalse = '<key>NSPrivacyTracking</key>\n    <false/>';
const trackingTrueWithPi = manifestXml.replace(
  trackingFalse,
  '<?audit <!--?>\n    <key>NSPrivacyTracking</key>\n    <true/>\n    <?audit -->?>',
);

test('the submitted privacy manifest parses past its comments', () => {
  assert.equal(manifest.NSPrivacyTracking, false);
  assert.deepEqual(manifest.NSPrivacyTrackingDomains, []);
  assert.ok(manifest.NSPrivacyAccessedAPITypes.length >= 4);
  assert.ok(
    manifest.NSPrivacyCollectedDataTypes.every(
      (entry) =>
        entry.NSPrivacyCollectedDataType.startsWith('NSPrivacyCollectedDataType') &&
        Array.isArray(entry.NSPrivacyCollectedDataTypePurposes),
    ),
  );
});

test('processing instructions cannot hide an affirmative tracking answer', () => {
  assert.ok(manifestXml.includes(trackingFalse));
  assert.equal(parsePrivacyManifest(trackingTrueWithPi).NSPrivacyTracking, true);
  assert.equal(compareManifests(parsePrivacyManifest(trackingTrueWithPi), manifest).length, 1);
});

test('the release command rejects tracking hidden between legal processing instructions', () => {
  const result = runReleaseGuard(trackingTrueWithPi);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no longer matches/);
  assert.doesNotMatch(result.stdout, /declaration agree/);
});

test('the release command accepts the actual locked manifest and Apple doctype', () => {
  const result = runReleaseGuard(manifestXml);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /declaration agree/);
});

test('legal processing instructions and CDATA preserve declared values', () => {
  const source = manifestXml
    .replace(trackingFalse, '<?audit <!--?>\n    ' + trackingFalse + '\n    <?audit -->?>')
    .replace('<string>CA92.1</string>', '<string><![CDATA[CA92.1]]></string>');
  assert.deepEqual(parsePrivacyManifest(source), manifest);
  assert.equal(runReleaseGuard(source).status, 0);
});

test('CDATA comment markers remain string data rather than removing privacy fields', () => {
  const source = manifestXml
    .replace(
      '<key>NSPrivacyTracking</key>',
      '<key>NSPrivacyTrackingDomains</key><array><string><![CDATA[<!--]]></string><string><![CDATA[-->]]></string></array><key>NSPrivacyTracking</key>',
    )
    .replace('<key>NSPrivacyTrackingDomains</key>\n    <array/>', '');
  const parsed = parsePrivacyManifest(source);
  assert.equal(parsed.NSPrivacyTracking, false);
  assert.deepEqual(parsed.NSPrivacyTrackingDomains, ['<!--', '-->']);
});

for (const [name, source] of [
  ['missing root close', manifestXml.replace('</plist>', '')],
  [
    'unterminated in-root comment',
    manifestXml.replace('</dict>\n</plist>', '<!-- unterminated\n</dict>\n</plist>'),
  ],
  ['unknown XML element', manifestXml.replace(trackingFalse, '<unknown/>\n    ' + trackingFalse)],
  ['unknown XML attribute', manifestXml.replace('<false/>', '<false unexpected="yes"/>')],
  [
    'duplicate root key',
    manifestXml.replace(trackingFalse, trackingFalse + '\n    ' + trackingFalse),
  ],
  [
    'duplicate nested key',
    manifestXml.replace(
      '<key>NSPrivacyAccessedAPIType</key>',
      '<key>NSPrivacyAccessedAPIType</key><string>duplicate</string><key>NSPrivacyAccessedAPIType</key>',
    ),
  ],
  ['missing tracking answer', manifestXml.replace(trackingFalse, '')],
  [
    'nonboolean tracking answer',
    manifestXml.replace(trackingFalse, '<key>NSPrivacyTracking</key><string>false</string>'),
  ],
  [
    'nonboolean collected answer',
    manifestXml.replace(
      '<key>NSPrivacyCollectedDataTypeLinked</key>\n            <true/>',
      '<key>NSPrivacyCollectedDataTypeLinked</key><string>true</string>',
    ),
  ],
  [
    'missing collected purposes',
    manifestXml.replace(
      /<key>NSPrivacyCollectedDataTypePurposes<\/key>\s*<array>[\s\S]*?<\/array>/u,
      '',
    ),
  ],
  ['nested boolean content', manifestXml.replace('<false/>', '<false>unexpected</false>')],
  ['missing dictionary value', manifestXml.replace(trackingFalse, '<key>NSPrivacyTracking</key>')],
  [
    'unknown privacy field',
    manifestXml.replace(
      trackingFalse,
      '<key>UnexpectedPrivacyAnswer</key><false/>\n    ' + trackingFalse,
    ),
  ],
  [
    'external entity declaration',
    manifestXml.replace(
      /<!DOCTYPE plist[^>]*>/u,
      '<!DOCTYPE plist [<!ENTITY secret SYSTEM "file:///etc/passwd">]>',
    ),
  ],
]) {
  test(`invalid privacy declaration rejects ${name}`, () => {
    assert.notEqual(source, manifestXml);
    assert.throws(() => parsePrivacyManifest(source));
    const result = runReleaseGuard(source);
    assert.equal(result.signal, null);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /declaration agree/);
  });
}

test('comparison rejects a missing built tracking answer rather than assuming false', () => {
  const built = globalThis.structuredClone(manifest);
  delete built.NSPrivacyTracking;
  assert.throws(() => compareManifests(manifest, built), /invalid privacy manifest schema/);
});

test('Play comparison rejects an incomplete submitted manifest', () => {
  const submitted = globalThis.structuredClone(manifest);
  delete submitted.NSPrivacyTracking;
  assert.throws(() => compareDataSafety(submitted, dataSafety), /invalid privacy manifest schema/);
});

test('the release command fails closed when Python is unavailable', () => {
  const result = runReleaseGuard(manifestXml, '');
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout, /declaration agree/);
});

test('a binary plist preserves the same privacy declaration', () => {
  const binary = execFileSync(
    'python3',
    [
      '-I',
      '-S',
      '-c',
      'import plistlib,sys; sys.stdout.buffer.write(plistlib.dumps(plistlib.loads(sys.stdin.buffer.read()),fmt=plistlib.FMT_BINARY))',
    ],
    { input: manifestXml },
  );
  assert.deepEqual(parsePrivacyManifest(binary), manifest);
  assert.equal(runReleaseGuard(binary).status, 0);
});

test('the locked submission copy matches itself', () => {
  assert.deepEqual(compareManifests(manifest, manifest), []);
});

test('a manifest that drifts from the built configuration is rejected', () => {
  const drifted = globalThis.structuredClone(manifest);
  drifted.NSPrivacyCollectedDataTypes.pop();
  assert.deepEqual(compareManifests(manifest, drifted), [
    'the locked submission PrivacyInfo.xcprivacy no longer matches ios.privacyManifests in app.config.js',
  ]);
});

test('the checked-in Play declaration covers every collected iOS data type', () => {
  assert.deepEqual(compareDataSafety(manifest, dataSafety), []);
});

test('an under-declared Play form is rejected', () => {
  const incomplete = globalThis.structuredClone(dataSafety);
  incomplete.collectedData = incomplete.collectedData.filter(
    (entry) => entry.iosPrivacyManifestType !== 'NSPrivacyCollectedDataTypeOtherUserContent',
  );
  const failures = compareDataSafety(manifest, incomplete);
  assert.ok(
    failures.some((message) => message.includes('NSPrivacyCollectedDataTypeOtherUserContent')),
  );
});

test('a Play form that contradicts the iOS tracking answer is rejected', () => {
  const contradictory = globalThis.structuredClone(dataSafety);
  contradictory.collectedData[0].usedForTracking = true;
  contradictory.usesAdvertisingId = true;
  const failures = compareDataSafety(manifest, contradictory);
  assert.ok(failures.some((message) => message.includes('different tracking answer')));
  assert.ok(failures.some((message) => message.includes('advertising ID')));
});

test('a Play form without a deletion URL or transit encryption is rejected', () => {
  const unsafe = globalThis.structuredClone(dataSafety);
  delete unsafe.dataDeletionRequestUrl;
  unsafe.allDataEncryptedInTransit = false;
  const failures = compareDataSafety(manifest, unsafe);
  assert.ok(failures.some((message) => message.includes('deletion request URL')));
  assert.ok(failures.some((message) => message.includes('encrypted in transit')));
});
