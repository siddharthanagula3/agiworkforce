/**
 * Regression test for MED-MOB-04 — Android backup-eligibility
 * (red-team finding 2026-05).
 *
 * Pre-fix: the Expo config did not declare `android.allowBackup`, defaulting to
 * `true` in the generated AndroidManifest.xml. With that default, ADB
 * backup (`adb backup -all`) and Google's auto-backup mechanism could
 * extract the app's EncryptedSharedPreferences — including SecureStore
 * blobs that contain Supabase access + refresh tokens — to a file
 * extractable from any device the user later restores onto.
 *
 * The fix sets `android.allowBackup = false` so neither path can extract
 * the auth tokens. iOS keychain items already use
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY` accessibility, which is intrinsically
 * not iCloud-backed, so iOS does not need a config change.
 *
 * This test reads `app.config.js` directly to pin the contract — Expo
 * generates the AndroidManifest from this file at prebuild, so this is
 * the source of truth. (Previously read app.json; migrated to app.config.js
 * in 2026-05 when app.json was replaced by the dynamic JS config.)
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const appConfig = require('../app.config.js') as {
  expo: {
    android?: { allowBackup?: boolean; package?: string };
    ios?: { bundleIdentifier?: string };
  };
};

describe('app.config.js — Android backup is disabled', () => {
  it('explicitly sets allowBackup to false', () => {
    expect(appConfig.expo.android).toBeDefined();
    expect(appConfig.expo.android!.allowBackup).toBe(false);
  });

  it('Android package is the canonical bundle id (sanity)', () => {
    expect(appConfig.expo.android!.package).toBe('com.agiworkforce.app');
  });

  it('iOS bundle id is the canonical id (sanity)', () => {
    expect(appConfig.expo.ios!.bundleIdentifier).toBe('com.agiworkforce.app');
  });
});
