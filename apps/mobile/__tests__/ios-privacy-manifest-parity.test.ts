/* eslint-disable @typescript-eslint/no-require-imports */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The tracked ios/ tree was deleted 2026-07-16, so `expo prebuild` regenerates
 * PrivacyInfo.xcprivacy from `ios.privacyManifests` in app.config.js. The copy
 * under store-listing/ is the reviewed text App Review reads. Nothing generates
 * one from the other, so without this test they drift silently and the shipped
 * manifest stops matching the reviewed one.
 */

const appConfig = require('../app.config.js') as {
  expo: { ios?: { privacyManifests?: Record<string, unknown> } };
};

const configured = appConfig.expo.ios?.privacyManifests ?? {};

const manifestBody = readFileSync(
  join(__dirname, '..', 'store-listing', 'ios', 'PrivacyInfo.xcprivacy'),
  'utf8',
);
const plist = require('plist') as typeof import('plist');

function canonicalManifestValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(canonicalManifestValue)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalManifestValue(entry)]),
    );
  }
  return value;
}

describe('iOS privacy manifest, generated config matches the reviewed copy', () => {
  it('matches every configured declaration, purpose, linked flag and tracking flag in both directions', () => {
    expect(canonicalManifestValue(plist.parse(manifestBody))).toEqual(
      canonicalManifestValue(configured),
    );
  });
});
