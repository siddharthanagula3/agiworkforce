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
