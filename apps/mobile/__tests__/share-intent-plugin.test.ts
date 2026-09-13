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
    expect(out).toContain('override fun onNewIntent(intent: Intent)');
    expect(out).toContain('val rewritten = rewriteShareIntent(intent)');
    expect(out).toContain('Intent.ACTION_SEND');
    expect(out).toContain('Intent.ACTION_PROCESS_TEXT');
    expect(out).toContain('agiworkforce');
    expect(out).toContain('MAX_SHARED_TEXT_CHARS = 100 * 1024');
    expect(out.indexOf('rewriteShareIntent(intent: Intent)')).toBeLessThan(
      out.indexOf('override fun getMainComponentName'),
    );
  });

  it('copies a shared stream into the app cache before the deep link', () => {
    const out = patchMainActivity(STOCK_MAIN_ACTIVITY);
    expect(out).toContain('Intent.ACTION_SEND_MULTIPLE');
    expect(out).toContain('Intent.EXTRA_STREAM');
    expect(out).toContain('contentResolver.openInputStream(uri)');
    expect(out).toContain('Uri.fromFile(target).toString()');
    expect(out).toContain('appendQueryParameter("files", files.toString())');
    expect(out).toContain('MAX_SHARED_FILE_BYTES = 12L * 1024 * 1024');
    expect(out).toContain('MAX_SHARED_FILES = 5');
    expect(out.indexOf('copySharedStreams(intent)')).toBeLessThan(
      out.indexOf('appendQueryParameter("files"'),
    );
  });

  it('reads the display name and mime type from the content provider', () => {
    const out = patchMainActivity(STOCK_MAIN_ACTIVITY);
    expect(out).toContain('import android.provider.OpenableColumns');
    expect(out).toContain('OpenableColumns.DISPLAY_NAME');
    expect(out).toContain('contentResolver.getType(uri) ?: "application/octet-stream"');
  });

  it('prunes the cached inbox so a share does not accumulate copies', () => {
    const out = patchMainActivity(STOCK_MAIN_ACTIVITY);
    expect(out).toContain('private fun pruneSharedInbox(inbox: File)');
    expect(out).toContain('SHARED_INBOX_TTL_MS');
  });

  it('is idempotent, patching twice changes nothing', () => {
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
