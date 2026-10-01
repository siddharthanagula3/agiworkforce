#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const XCPRIVACY_PATH = path.join(mobileRoot, 'store-listing/ios/PrivacyInfo.xcprivacy');
const DATA_SAFETY_PATH = path.join(mobileRoot, 'store-listing/android/data-safety.json');

function hasExactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isStringArray(value) {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string' && entry.trim().length > 0)
  );
}

function validatePrivacyManifest(manifest) {
  const accessedKeys = ['NSPrivacyAccessedAPIType', 'NSPrivacyAccessedAPITypeReasons'];
  const collectedKeys = [
    'NSPrivacyCollectedDataType',
    'NSPrivacyCollectedDataTypeLinked',
    'NSPrivacyCollectedDataTypeTracking',
    'NSPrivacyCollectedDataTypePurposes',
  ];
  if (
    !hasExactKeys(manifest, [
      'NSPrivacyAccessedAPITypes',
      'NSPrivacyCollectedDataTypes',
      'NSPrivacyTracking',
      'NSPrivacyTrackingDomains',
    ]) ||
    typeof manifest.NSPrivacyTracking !== 'boolean' ||
    !isStringArray(manifest.NSPrivacyTrackingDomains) ||
    !Array.isArray(manifest.NSPrivacyAccessedAPITypes) ||
    !manifest.NSPrivacyAccessedAPITypes.every(
      (entry) =>
        hasExactKeys(entry, accessedKeys) &&
        typeof entry.NSPrivacyAccessedAPIType === 'string' &&
        entry.NSPrivacyAccessedAPIType.trim().length > 0 &&
        isStringArray(entry.NSPrivacyAccessedAPITypeReasons),
    ) ||
    !Array.isArray(manifest.NSPrivacyCollectedDataTypes) ||
    !manifest.NSPrivacyCollectedDataTypes.every(
      (entry) =>
        hasExactKeys(entry, collectedKeys) &&
        typeof entry.NSPrivacyCollectedDataType === 'string' &&
        entry.NSPrivacyCollectedDataType.trim().length > 0 &&
        typeof entry.NSPrivacyCollectedDataTypeLinked === 'boolean' &&
        typeof entry.NSPrivacyCollectedDataTypeTracking === 'boolean' &&
        isStringArray(entry.NSPrivacyCollectedDataTypePurposes),
    )
  ) {
    throw new Error('invalid privacy manifest schema');
  }
  return manifest;
}

export function parsePrivacyManifest(source) {
  try {
    const parsed = execFileSync(
      'python3',
      ['-I', '-S', path.join(mobileRoot, 'scripts/release/parse-privacy-manifest.py')],
      {
        input: source,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    return validatePrivacyManifest(JSON.parse(parsed));
  } catch {
    throw new Error('invalid privacy manifest or unavailable plist parser');
  }
}

function sortByKey(entries, key) {
  return [...entries].sort((left, right) => String(left[key]).localeCompare(String(right[key])));
}

export function compareManifests(submitted, built) {
  validatePrivacyManifest(submitted);
  validatePrivacyManifest(built);
  const failures = [];
  const normalize = (manifest) => ({
    accessed: sortByKey(manifest.NSPrivacyAccessedAPITypes, 'NSPrivacyAccessedAPIType').map(
      (entry) => ({
        type: entry.NSPrivacyAccessedAPIType,
        reasons: [...entry.NSPrivacyAccessedAPITypeReasons].sort(),
      }),
    ),
    collected: sortByKey(manifest.NSPrivacyCollectedDataTypes, 'NSPrivacyCollectedDataType').map(
      (entry) => ({
        type: entry.NSPrivacyCollectedDataType,
        linked: entry.NSPrivacyCollectedDataTypeLinked,
        tracking: entry.NSPrivacyCollectedDataTypeTracking,
        purposes: [...entry.NSPrivacyCollectedDataTypePurposes].sort(),
      }),
    ),
    tracking: manifest.NSPrivacyTracking,
    trackingDomains: [...manifest.NSPrivacyTrackingDomains].sort(),
  });

  const left = JSON.stringify(normalize(submitted));
  const right = JSON.stringify(normalize(built));
  if (left !== right) {
    failures.push(
      'the locked submission PrivacyInfo.xcprivacy no longer matches ios.privacyManifests in app.config.js',
    );
  }
  return failures;
}

export function compareDataSafety(manifest, dataSafety) {
  validatePrivacyManifest(manifest);
  const failures = [];
  const declared = new Map(
    (dataSafety.collectedData ?? []).map((entry) => [entry.iosPrivacyManifestType, entry]),
  );

  for (const entry of manifest.NSPrivacyCollectedDataTypes) {
    const type = entry.NSPrivacyCollectedDataType;
    const android = declared.get(type);
    if (!android) {
      failures.push(`Play data safety does not declare ${type}, which iOS says the app collects`);
      continue;
    }
    if (android.collected !== true) {
      failures.push(`${type} is collected on iOS but declared as not collected for Play`);
    }
    if (android.usedForTracking !== entry.NSPrivacyCollectedDataTypeTracking) {
      failures.push(`${type} declares a different tracking answer on Play than on iOS`);
    }
    if (typeof android.sharedWithThirdParties !== 'boolean') {
      failures.push(`${type} must answer the Play sharing question with a boolean`);
    }
    if (!Array.isArray(android.purposes) || android.purposes.length === 0) {
      failures.push(`${type} must declare at least one Play purpose`);
    }
  }

  const manifestTypes = new Set(
    manifest.NSPrivacyCollectedDataTypes.map((entry) => entry.NSPrivacyCollectedDataType),
  );
  for (const type of declared.keys()) {
    if (!manifestTypes.has(type)) {
      failures.push(`Play data safety declares ${type}, which the iOS privacy manifest does not`);
    }
  }

  if (manifest.NSPrivacyTracking === false && dataSafety.usesAdvertisingId !== false) {
    failures.push(
      'iOS declares no tracking, so the Play declaration must not claim an advertising ID',
    );
  }
  if (!dataSafety.dataDeletionRequestUrl) {
    failures.push('Play data safety requires a published data deletion request URL');
  }
  if (dataSafety.allDataEncryptedInTransit !== true) {
    failures.push('Play data safety must declare that collected data is encrypted in transit');
  }

  return failures;
}

function readBuiltManifest() {
  const source = execFileSync(
    process.execPath,
    [
      '-e',
      'process.stdout.write(JSON.stringify(require("./app.config.js").expo.ios.privacyManifests))',
    ],
    {
      cwd: mobileRoot,
      env: {
        ...process.env,
        APP_ENV: 'production',
        EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:
          process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? 'pk_live_privacy_manifest_check',
      },
      encoding: 'utf8',
    },
  );
  return JSON.parse(source);
}

function main() {
  const failures = [];
  for (const required of [XCPRIVACY_PATH, DATA_SAFETY_PATH]) {
    if (!fs.existsSync(required)) {
      failures.push(`missing required declaration: ${path.relative(mobileRoot, required)}`);
    }
  }
  if (failures.length === 0) {
    const submitted = parsePrivacyManifest(fs.readFileSync(XCPRIVACY_PATH));
    const built = readBuiltManifest();
    const dataSafety = JSON.parse(fs.readFileSync(DATA_SAFETY_PATH, 'utf8'));
    failures.push(...compareManifests(submitted, built));
    failures.push(...compareDataSafety(submitted, dataSafety));
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      process.stderr.write(`ERROR: ${failure}\n`);
    }
    process.exit(1);
  }
  process.stdout.write('iOS privacy manifest and Play data-safety declaration agree\n');
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
