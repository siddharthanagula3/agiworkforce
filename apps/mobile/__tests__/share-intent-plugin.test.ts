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

  it('reserves an exclusive staging file before opening the output stream', () => {
    const out = patchMainActivity(STOCK_MAIN_ACTIVITY);
    expect(out).toContain('val target = try {\n      File.createTempFile("shared-", suffix, inbox)');
    expect(out).toContain('} catch (error: Exception) {\n      return null\n    }\n    val bytes = try');
    expect(out.indexOf('File.createTempFile(')).toBeLessThan(out.indexOf('target.outputStream()'));
    expect(out).not.toContain('val target = File(inbox,');
    expect(out).not.toContain('val safeName =');
  });

  it('retains a bounded safe extension for generic-MIME document parsing', () => {
    const out = patchMainActivity(STOCK_MAIN_ACTIVITY);
    expect(out).toContain("fileName.substringAfterLast('.', \"\")");
    expect(out).toContain('.takeIf { it.matches(Regex("[A-Za-z0-9]{1,16}")) }');
    expect(out).toContain('?.let { ".${it}" } ?: ".bin"');
    expect(out).toContain('File.createTempFile("shared-", suffix, inbox)');
    expect(out).toContain('.put("fileName", fileName)');
    expect(out).toContain('.put("mimeType", mimeType)');
    expect(out).toContain('contentResolver.getType(uri) ?: "application/octet-stream"');
    expect(out).toContain('output.write(buffer, 0, read)');
  });

  it('cleans up only its reserved target when the copy fails', () => {
    const out = patchMainActivity(STOCK_MAIN_ACTIVITY);
    const copyMethod = out.slice(
      out.indexOf('private fun copySharedStream(uri:'),
      out.indexOf('private fun sharedDisplayName('),
    );
    expect(copyMethod).toContain('if (bytes == null || bytes < 0L) {\n      target.delete()');
    expect(copyMethod.match(/\.delete\(\)/g)).toHaveLength(1);
    expect(copyMethod).not.toContain('listFiles');
    expect(copyMethod).not.toContain('File(inbox,');
    expect(copyMethod).toContain('.put("uri", Uri.fromFile(target).toString())');
  });

  it('reports native text clipping through the existing preview flag', () => {
    const out = patchMainActivity(STOCK_MAIN_ACTIVITY);
    expect(out).toContain('appendQueryParameter("text", text.take(MAX_SHARED_TEXT_CHARS))');
    expect(out).toContain(
      'if (text.length > MAX_SHARED_TEXT_CHARS) {\n            appendQueryParameter("truncated", "1")',
    );
  });

  it('leaves legacy marker-bearing activities unchanged, requiring clean regeneration', () => {
    const legacy = STOCK_MAIN_ACTIVITY.replace(
      '  override fun getMainComponentName()',
      '  private fun rewriteShareIntent(intent: Intent): Intent = intent\n\n  override fun getMainComponentName()',
    );
    expect(patchMainActivity(legacy)).toBe(legacy);
    expect(patchMainActivity(legacy)).not.toContain('File.createTempFile(');
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
