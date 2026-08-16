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
).replace(/<!--[\s\S]*?-->/g, '');

const lockedStrings = new Set(
  [...manifestBody.matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1]!.trim()),
);
const lockedKeys = new Set(
  [...manifestBody.matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1]!.trim()),
);

describe('iOS privacy manifest — generated config matches the reviewed copy', () => {
  it('declares every top-level key the reviewed manifest declares', () => {
    for (const topLevel of [
      'NSPrivacyAccessedAPITypes',
      'NSPrivacyCollectedDataTypes',
      'NSPrivacyTracking',
      'NSPrivacyTrackingDomains',
    ]) {
      expect(lockedKeys.has(topLevel)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(configured, topLevel)).toBe(true);
    }
  });

  it('declares no API type or reason the reviewed manifest does not carry', () => {
    const apiTypes = (configured['NSPrivacyAccessedAPITypes'] ?? []) as Array<{
      NSPrivacyAccessedAPIType: string;
      NSPrivacyAccessedAPITypeReasons: string[];
    }>;

    expect(apiTypes.length).toBeGreaterThan(0);
    for (const entry of apiTypes) {
      expect(lockedStrings.has(entry.NSPrivacyAccessedAPIType)).toBe(true);
      for (const reason of entry.NSPrivacyAccessedAPITypeReasons) {
        expect(lockedStrings.has(reason)).toBe(true);
      }
    }
  });

  it('declares no collected data type the reviewed manifest does not carry', () => {
    const collected = (configured['NSPrivacyCollectedDataTypes'] ?? []) as Array<{
      NSPrivacyCollectedDataType: string;
      NSPrivacyCollectedDataTypePurposes: string[];
    }>;

    expect(collected.length).toBeGreaterThan(0);
    for (const entry of collected) {
      expect(lockedStrings.has(entry.NSPrivacyCollectedDataType)).toBe(true);
      for (const purpose of entry.NSPrivacyCollectedDataTypePurposes) {
        expect(lockedStrings.has(purpose)).toBe(true);
      }
    }
  });

  it('agrees that the app does not track', () => {
    expect(configured['NSPrivacyTracking']).toBe(false);
    expect(manifestBody).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    expect(configured['NSPrivacyTrackingDomains']).toEqual([]);
    expect(manifestBody).toMatch(/<key>NSPrivacyTrackingDomains<\/key>\s*<array\/>/);
  });
});
