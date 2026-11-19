/* eslint-disable @typescript-eslint/no-require-imports */

const { patchMainActivity } = require('../native/android/withAGITabletOrientation.cjs') as {
  patchMainActivity: (contents: string) => string;
};
const { patchMainActivity: patchShareIntent } =
  require('../native/android/withAGIShareIntent.cjs') as {
    patchMainActivity: (contents: string) => string;
  };
const appConfig = require('../app.config.js') as {
  expo: { orientation?: string; plugins?: unknown[] };
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

const WAVE_2_MAIN_ACTIVITY = `package com.agiworkforce.app
import expo.modules.splashscreen.SplashScreenManager
import android.content.pm.ActivityInfo
import android.content.res.Configuration

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

private const val LARGE_SCREEN_MIN_WIDTH_DP = 600

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY) sync-f3ff59a
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    applyScreenOrientation(resources.configuration)
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

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    applyScreenOrientation(newConfig)
  }

  private fun applyScreenOrientation(configuration: Configuration) {
    requestedOrientation =
      if (configuration.smallestScreenWidthDp >= LARGE_SCREEN_MIN_WIDTH_DP) {
        ActivityInfo.SCREEN_ORIENTATION_FULL_USER
      } else {
        ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
      }
  }
}
`;

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function braceBalance(text: string): number {
  return occurrences(text, '{') - occurrences(text, '}');
}

describe('withAGITabletOrientation patchMainActivity', () => {
  it('keeps phones on the portrait lock the manifest already declares', () => {
    expect(appConfig.expo.orientation).toBe('portrait');
    const out = patchMainActivity(STOCK_MAIN_ACTIVITY);
    expect(out).toContain('ActivityInfo.SCREEN_ORIENTATION_PORTRAIT');
  });

  it('lets a large screen rotate freely, decided before the first frame', () => {
    const out = patchMainActivity(STOCK_MAIN_ACTIVITY);
    expect(out).toContain('import android.content.pm.ActivityInfo');
    expect(out).toContain('import android.content.res.Configuration');
    expect(out).toContain('private const val LARGE_SCREEN_MIN_WIDTH_DP = 600');
    expect(out).toContain('configuration.smallestScreenWidthDp >= LARGE_SCREEN_MIN_WIDTH_DP');
    expect(out).toContain('ActivityInfo.SCREEN_ORIENTATION_FULL_USER');
    expect(out.indexOf('applyScreenOrientation(resources.configuration)')).toBeLessThan(
      out.indexOf('super.onCreate(null)'),
    );
  });

  it('re-decides when a foldable or a resized window changes the smallest width', () => {
    const out = patchMainActivity(STOCK_MAIN_ACTIVITY);
    expect(out).toContain('override fun onConfigurationChanged(newConfig: Configuration)');
    expect(out).toContain('applyScreenOrientation(newConfig)');
  });

  it('locks a phone to portrait once per screen size class, so a lock set from JavaScript survives a turn', () => {
    const out = patchMainActivity(STOCK_MAIN_ACTIVITY);
    expect(out).toContain('private var appliedLargeScreen: Boolean? = null');
    const method = out.slice(out.indexOf('private fun applyScreenOrientation'));
    const guard = method.indexOf('if (largeScreen == appliedLargeScreen) return');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(method.indexOf('appliedLargeScreen = largeScreen'));
    expect(method.indexOf('appliedLargeScreen = largeScreen')).toBeLessThan(
      method.indexOf('requestedOrientation ='),
    );
    expect(occurrences(out, 'requestedOrientation =')).toBe(1);
  });

  it('upgrades a MainActivity that still puts portrait back on every turn, without a clean prebuild', () => {
    const fresh = patchMainActivity(STOCK_MAIN_ACTIVITY);
    expect(patchMainActivity(WAVE_2_MAIN_ACTIVITY)).toBe(fresh);

    const withShareIntent = patchMainActivity(patchShareIntent(WAVE_2_MAIN_ACTIVITY));
    expect(occurrences(withShareIntent, 'private var appliedLargeScreen: Boolean? = null')).toBe(1);
    expect(occurrences(withShareIntent, 'private fun applyScreenOrientation')).toBe(1);
    expect(occurrences(withShareIntent, 'requestedOrientation =')).toBe(1);
    expect(occurrences(withShareIntent, 'override fun onConfigurationChanged')).toBe(1);
    expect(braceBalance(withShareIntent)).toBe(0);
    expect(patchMainActivity(withShareIntent)).toBe(withShareIntent);
  });

  it('stops the build when an earlier orientation patch has a shape it cannot upgrade', () => {
    const unknown = WAVE_2_MAIN_ACTIVITY.replace(
      '  private fun applyScreenOrientation(configuration: Configuration) {',
      '  fun applyScreenOrientation(configuration: Configuration) {',
    );
    expect(() => patchMainActivity(unknown)).toThrow('expo prebuild --clean');
  });

  it('is idempotent and keeps the class closed', () => {
    const once = patchMainActivity(STOCK_MAIN_ACTIVITY);
    expect(patchMainActivity(once)).toBe(once);
    expect(braceBalance(once)).toBe(0);
    expect(once.trimEnd().endsWith('}')).toBe(true);
  });

  it('composes with the share-intent patch in either order', () => {
    for (const out of [
      patchMainActivity(patchShareIntent(STOCK_MAIN_ACTIVITY)),
      patchShareIntent(patchMainActivity(STOCK_MAIN_ACTIVITY)),
    ]) {
      expect(occurrences(out, 'companion object')).toBe(1);
      expect(occurrences(out, 'override fun onConfigurationChanged')).toBe(1);
      expect(out.indexOf('applyScreenOrientation(resources.configuration)')).toBeLessThan(
        out.indexOf('super.onCreate(null)'),
      );
      expect(out.indexOf('setIntent(rewriteShareIntent(it))')).toBeLessThan(
        out.indexOf('super.onCreate(null)'),
      );
    }
  });

  it('is registered so prebuild applies it', () => {
    expect(appConfig.expo.plugins).toContain('./native/android/withAGITabletOrientation.cjs');
  });
});
