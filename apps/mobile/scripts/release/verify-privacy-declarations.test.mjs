import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  compareDataSafety,
  compareManifests,
  parsePrivacyManifest,
} from './verify-privacy-declarations.mjs';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = parsePrivacyManifest(
  fs.readFileSync(path.join(mobileRoot, 'store-listing/ios/PrivacyInfo.xcprivacy'), 'utf8'),
);
const dataSafety = JSON.parse(
  fs.readFileSync(path.join(mobileRoot, 'store-listing/android/data-safety.json'), 'utf8'),
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

test('the locked submission copy matches itself', () => {
  assert.deepEqual(compareManifests(manifest, manifest), []);
});

test('a manifest that drifts from the built configuration is rejected', () => {
  const drifted = structuredClone(manifest);
  drifted.NSPrivacyCollectedDataTypes.pop();
  assert.deepEqual(compareManifests(manifest, drifted), [
    'the locked submission PrivacyInfo.xcprivacy no longer matches ios.privacyManifests in app.config.js',
  ]);
});

test('the checked-in Play declaration covers every collected iOS data type', () => {
  assert.deepEqual(compareDataSafety(manifest, dataSafety), []);
});

test('an under-declared Play form is rejected', () => {
  const incomplete = structuredClone(dataSafety);
  incomplete.collectedData = incomplete.collectedData.filter(
    (entry) => entry.iosPrivacyManifestType !== 'NSPrivacyCollectedDataTypeOtherUserContent',
  );
  const failures = compareDataSafety(manifest, incomplete);
  assert.ok(
    failures.some((message) => message.includes('NSPrivacyCollectedDataTypeOtherUserContent')),
  );
});

test('a Play form that contradicts the iOS tracking answer is rejected', () => {
  const contradictory = structuredClone(dataSafety);
  contradictory.collectedData[0].usedForTracking = true;
  contradictory.usesAdvertisingId = true;
  const failures = compareDataSafety(manifest, contradictory);
  assert.ok(failures.some((message) => message.includes('different tracking answer')));
  assert.ok(failures.some((message) => message.includes('advertising ID')));
});

test('a Play form without a deletion URL or transit encryption is rejected', () => {
  const unsafe = structuredClone(dataSafety);
  delete unsafe.dataDeletionRequestUrl;
  unsafe.allDataEncryptedInTransit = false;
  const failures = compareDataSafety(manifest, unsafe);
  assert.ok(failures.some((message) => message.includes('deletion request URL')));
  assert.ok(failures.some((message) => message.includes('encrypted in transit')));
});
