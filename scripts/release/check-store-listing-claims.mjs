#!/usr/bin/env node
// Holds the store listings to the binary rather than to somebody's memory.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  appIdentifierFrom,
  appVersionFrom,
  NATIVE_PURCHASE_SOURCE_PATHS,
  nativePurchaseSupportFrom,
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
    nativePurchases: nativePurchaseSupportFrom(
      Object.fromEntries(
        Object.entries(NATIVE_PURCHASE_SOURCE_PATHS).map(([name, file]) => [name, read(file)]),
      ),
    ),
  });

  if (failures.length === 0) {
    console.log(
      'Store listings match the shipped version, ids and native purchase capability; live sales remain server/store gated',
    );
    return;
  }
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}

main();
