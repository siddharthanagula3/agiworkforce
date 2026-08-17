#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const XCPRIVACY_PATH = path.join(mobileRoot, 'store-listing/ios/PrivacyInfo.xcprivacy');
const DATA_SAFETY_PATH = path.join(mobileRoot, 'store-listing/android/data-safety.json');

function stripComments(xml) {
  return xml.replace(/<!--[\s\S]*?-->/gu, '');
}

function sliceArray(xml, key) {
  const keyIndex = xml.indexOf(`<key>${key}</key>`);
  if (keyIndex === -1) return null;
  const start = xml.indexOf('<array', keyIndex);
  if (start === -1) return null;
  if (/^<array\s*\/>/u.test(xml.slice(start))) return '';
  const open = xml.indexOf('>', start) + 1;
  let depth = 1;
  let cursor = open;
  while (depth > 0) {
    const nextOpen = xml.indexOf('<array>', cursor);
    const nextClose = xml.indexOf('</array>', cursor);
    if (nextClose === -1) throw new Error(`unterminated <array> for ${key}`);
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      cursor = nextOpen + '<array>'.length;
    } else {
      depth -= 1;
      cursor = nextClose + '</array>'.length;
      if (depth === 0) return xml.slice(open, nextClose);
    }
  }
  return '';
}

function splitDicts(arrayBody) {
  const dicts = [];
  let cursor = 0;
  while (true) {
    const start = arrayBody.indexOf('<dict>', cursor);
    if (start === -1) break;
    const end = arrayBody.indexOf('</dict>', start);
    if (end === -1) throw new Error('unterminated <dict>');
    dicts.push(arrayBody.slice(start + '<dict>'.length, end));
    cursor = end + '</dict>'.length;
  }
  return dicts;
}

function stringValue(dictBody, key) {
  const match = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`, 'u').exec(dictBody);
  return match ? match[1] : undefined;
}

function boolValue(dictBody, key) {
  const match = new RegExp(`<key>${key}</key>\\s*<(true|false)\\s*/>`, 'u').exec(dictBody);
  return match ? match[1] === 'true' : undefined;
}

function stringArrayValue(dictBody, key) {
  const body = sliceArray(dictBody, key);
  if (body === null) return undefined;
  return [...body.matchAll(/<string>([^<]*)<\/string>/gu)].map((match) => match[1]);
}

export function parsePrivacyManifest(xml) {
  const clean = stripComments(xml);
  const accessed = splitDicts(sliceArray(clean, 'NSPrivacyAccessedAPITypes') ?? '').map((dict) => ({
    NSPrivacyAccessedAPIType: stringValue(dict, 'NSPrivacyAccessedAPIType'),
    NSPrivacyAccessedAPITypeReasons: stringArrayValue(dict, 'NSPrivacyAccessedAPITypeReasons'),
  }));
  const collected = splitDicts(sliceArray(clean, 'NSPrivacyCollectedDataTypes') ?? '').map(
    (dict) => ({
      NSPrivacyCollectedDataType: stringValue(dict, 'NSPrivacyCollectedDataType'),
      NSPrivacyCollectedDataTypeLinked: boolValue(dict, 'NSPrivacyCollectedDataTypeLinked'),
      NSPrivacyCollectedDataTypeTracking: boolValue(dict, 'NSPrivacyCollectedDataTypeTracking'),
      NSPrivacyCollectedDataTypePurposes: stringArrayValue(
        dict,
        'NSPrivacyCollectedDataTypePurposes',
      ),
    }),
  );
  return {
    NSPrivacyAccessedAPITypes: accessed,
    NSPrivacyCollectedDataTypes: collected,
    NSPrivacyTracking: boolValue(clean, 'NSPrivacyTracking'),
    NSPrivacyTrackingDomains: stringArrayValue(clean, 'NSPrivacyTrackingDomains') ?? [],
  };
}

function sortByKey(entries, key) {
  return [...entries].sort((left, right) => String(left[key]).localeCompare(String(right[key])));
}

export function compareManifests(submitted, built) {
  const failures = [];
  const normalize = (manifest) => ({
    accessed: sortByKey(manifest.NSPrivacyAccessedAPITypes ?? [], 'NSPrivacyAccessedAPIType').map(
      (entry) => ({
        type: entry.NSPrivacyAccessedAPIType,
        reasons: [...(entry.NSPrivacyAccessedAPITypeReasons ?? [])].sort(),
      }),
    ),
    collected: sortByKey(
      manifest.NSPrivacyCollectedDataTypes ?? [],
      'NSPrivacyCollectedDataType',
    ).map((entry) => ({
      type: entry.NSPrivacyCollectedDataType,
      linked: entry.NSPrivacyCollectedDataTypeLinked,
      tracking: entry.NSPrivacyCollectedDataTypeTracking,
      purposes: [...(entry.NSPrivacyCollectedDataTypePurposes ?? [])].sort(),
    })),
    tracking: manifest.NSPrivacyTracking ?? false,
    trackingDomains: [...(manifest.NSPrivacyTrackingDomains ?? [])].sort(),
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
  const failures = [];
  const declared = new Map(
    (dataSafety.collectedData ?? []).map((entry) => [entry.iosPrivacyManifestType, entry]),
  );

  for (const entry of manifest.NSPrivacyCollectedDataTypes ?? []) {
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
    (manifest.NSPrivacyCollectedDataTypes ?? []).map((entry) => entry.NSPrivacyCollectedDataType),
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
    const submitted = parsePrivacyManifest(fs.readFileSync(XCPRIVACY_PATH, 'utf8'));
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
