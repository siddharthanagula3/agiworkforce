/**
 * Tests for the withAGIShareIntent config plugin's MainActivity.kt patch.
 *
 * android/ is a GENERATED directory (gitignored): the ACTION_SEND /
 * ACTION_PROCESS_TEXT → deep-link rewrite only survives `expo prebuild` if
 * this plugin re-applies it. These tests pin the string transform against a
 * representative stock Expo-template MainActivity.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

const { patchMainActivity } = require('../native/android/withAGIShareIntent.cjs') as {
  patchMainActivity: (contents: string) => string;
};

const STOCK_MAIN_ACTIVITY = `package com.agiworkforce.app
import expo.modules.splashscreen.SplashScreenManager

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY) sync-f3ff59a
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    super.onCreate(null)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }
}
`;

describe('withAGIShareIntent patchMainActivity', () => {
  it('adds the Intent/Uri imports', () => {
    const out = patchMainActivity(STOCK_MAIN_ACTIVITY);
    expect(out).toContain('import android.content.Intent');
    expect(out).toContain('import android.net.Uri');
  });

  it('rewrites the incoming intent before super.onCreate', () => {
    const out = patchMainActivity(STOCK_MAIN_ACTIVITY);
    const rewriteIdx = out.indexOf('setIntent(rewriteShareIntent(it))');
    const superIdx = out.indexOf('super.onCreate(null)');
    expect(rewriteIdx).toBeGreaterThan(-1);
    expect(rewriteIdx).toBeLessThan(superIdx);
  });

  it('adds onNewIntent and the rewriteShareIntent handler covering SEND and PROCESS_TEXT', () => {
    const out = patchMainActivity(STOCK_MAIN_ACTIVITY);
    expect(out).toContain('override fun onNewIntent(intent: Intent?)');
    expect(out).toContain('Intent.ACTION_SEND');
    expect(out).toContain('Intent.ACTION_PROCESS_TEXT');
    expect(out).toContain('agiworkforce');
    // Payload is bounded to the share-preview cap.
    expect(out).toContain('MAX_SHARED_TEXT_CHARS = 100 * 1024');
    // Inserted before the getMainComponentName block, inside the class body.
    expect(out.indexOf('rewriteShareIntent(intent: Intent)')).toBeLessThan(
      out.indexOf('override fun getMainComponentName'),
    );
  });

  it('is idempotent — patching twice changes nothing', () => {
    const once = patchMainActivity(STOCK_MAIN_ACTIVITY);
    const twice = patchMainActivity(once);
    expect(twice).toBe(once);
  });

  it('keeps balanced braces (structurally valid Kotlin insertion)', () => {
    const out = patchMainActivity(STOCK_MAIN_ACTIVITY);
    const opens = (out.match(/\{/g) ?? []).length;
    const closes = (out.match(/\}/g) ?? []).length;
    expect(opens).toBe(closes);
  });

  it('throws loudly when the template anchor is missing (never silently skips)', () => {
    expect(() => patchMainActivity('class Foo {}')).toThrow(/import block|super\.onCreate/);
  });
});
