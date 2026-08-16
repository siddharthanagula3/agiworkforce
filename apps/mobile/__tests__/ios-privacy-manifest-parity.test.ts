import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The tracked ios/ tree was deleted 2026-07-16, so `expo prebuild` regenerates
 * PrivacyInfo.xcprivacy from `ios.privacyManifests` in app.config.js. The copy
 * under store-listing/ is the reviewed text App Review reads. Nothing regenerates
 * one from the other, so without this test they drift silently and the shipped
 * manifest stops matching the reviewed one.
 */

const mobileRoot = join(import.meta.dirname, '..');
const lockedManifest = readFileSync(
  join(mobileRoot, 'store-listing', 'ios', 'PrivacyInfo.xcprivacy'),
  'utf8',
);

function stripComments(plist: string): string {
  return plist.replace(/<!--[\s\S]*?-->/g, '');
}

const manifestBody = stripComments(lockedManifest);

function lockedStrings(): Set<string> {
  return new Set([...manifestBody.matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1]!.trim()));
}

function lockedKeys(): Set<string> {
  return new Set([...manifestBody.matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1]!.trim()));
}

async function configuredPrivacyManifests(): Promise<Record<string, unknown>> {
  const mod = (await import('../app.config.js')) as {
    default: unknown;
  };
  const config = typeof mod.default === 'function' ? mod.default({}) : mod.default;
  const expo = (config as { expo?: Record<string, unknown> }).expo ?? config;
  const ios = (expo as { ios?: Record<string, unknown> }).ios ?? {};
  return (ios['privacyManifests'] ?? {}) as Record<string, unknown>;
}

describe('iOS privacy manifest · generated config matches the reviewed copy', () => {
  it('declares every top-level key the reviewed manifest declares', async () => {
    const configured = await configuredPrivacyManifests();
    const keys = lockedKeys();

    for (const topLevel of [
      'NSPrivacyAccessedAPITypes',
      'NSPrivacyCollectedDataTypes',
      'NSPrivacyTracking',
      'NSPrivacyTrackingDomains',
    ]) {
      expect(keys.has(topLevel), `${topLevel} missing from the reviewed manifest`).toBe(true);
      expect(
        Object.hasOwn(configured, topLevel),
        `${topLevel} is in the reviewed manifest but not in app.config.js — prebuild would emit a manifest that does not match what App Review read`,
      ).toBe(true);
    }
  });

  it('declares no API type or reason the reviewed manifest does not carry', async () => {
    const configured = await configuredPrivacyManifests();
    const locked = lockedStrings();
    const apiTypes = (configured['NSPrivacyAccessedAPITypes'] ?? []) as Array<{
      NSPrivacyAccessedAPIType: string;
      NSPrivacyAccessedAPITypeReasons: string[];
    }>;

    expect(apiTypes.length).toBeGreaterThan(0);
    for (const entry of apiTypes) {
      expect(locked.has(entry.NSPrivacyAccessedAPIType)).toBe(true);
      for (const reason of entry.NSPrivacyAccessedAPITypeReasons) {
        expect(locked.has(reason), `reason ${reason} is not in the reviewed manifest`).toBe(true);
      }
    }
  });

  it('declares no collected data type the reviewed manifest does not carry', async () => {
    const configured = await configuredPrivacyManifests();
    const locked = lockedStrings();
    const collected = (configured['NSPrivacyCollectedDataTypes'] ?? []) as Array<{
      NSPrivacyCollectedDataType: string;
      NSPrivacyCollectedDataTypePurposes: string[];
    }>;

    expect(collected.length).toBeGreaterThan(0);
    for (const entry of collected) {
      expect(locked.has(entry.NSPrivacyCollectedDataType)).toBe(true);
      for (const purpose of entry.NSPrivacyCollectedDataTypePurposes) {
        expect(locked.has(purpose)).toBe(true);
      }
    }
  });

  it('agrees that the app does not track', async () => {
    const configured = await configuredPrivacyManifests();
    expect(configured['NSPrivacyTracking']).toBe(false);
    expect(manifestBody).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    expect(configured['NSPrivacyTrackingDomains']).toEqual([]);
    expect(manifestBody).toMatch(/<key>NSPrivacyTrackingDomains<\/key>\s*<array\/>/);
  });
});
