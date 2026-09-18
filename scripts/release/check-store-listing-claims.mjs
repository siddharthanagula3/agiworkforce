#!/usr/bin/env node
// Holds the store listings to the binary rather than to somebody's memory.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  appIdentifierFrom,
  appVersionFrom,
  billingEnabledFrom,
  storeListingFailures,
} from '../lib/rollout/store-listing.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relative) {
  return readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

function main() {
  const appConfig = read('apps/mobile/app.config.js');
  const failures = storeListingFailures({
    ios: JSON.parse(read('apps/mobile/store-listing/LISTING-METADATA-IOS.json')),
    android: JSON.parse(read('apps/mobile/store-listing/LISTING-METADATA-ANDROID.json')),
    appVersion: appVersionFrom(appConfig),
    appIdentifier: appIdentifierFrom(appConfig),
    billingEnabled: billingEnabledFrom(read('apps/mobile/lib/v1FeatureFlags.ts')),
  });

  if (failures.length === 0) {
    console.log('Store listings match the shipped version, ids and billing state');
    return;
  }
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}

main();
