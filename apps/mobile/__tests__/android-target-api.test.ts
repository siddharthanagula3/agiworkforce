import config from '../app.config.js';

/**
 * Google Play has required API 36 for new submissions and for updates since
 * 2026-08-31. API 35 only keeps an already-published app available to existing
 * users; it does not let a new build through.
 *
 * Expo's own default is 35 (`ExpoRootProjectPlugin.kt` in
 * expo-modules-autolinking), so this is not a value the toolchain will keep
 * current for us. Without the override the AAB is built at 35 and rejected at
 * submission, which is the most expensive place to find out.
 */
const PLAY_MINIMUM_TARGET_API = 36;

function androidBuildProperties(): Record<string, unknown> {
  const resolved = typeof config === 'function' ? config({ config: {} }) : config;
  const app = (resolved as { expo?: unknown }).expo ?? resolved;
  const plugins = (app as { plugins?: unknown[] }).plugins ?? [];
  const entry = plugins.find(
    (plugin): plugin is [string, { android?: Record<string, unknown> }] =>
      Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
  );
  if (!entry) throw new Error('expo-build-properties is not configured');
  return entry[1].android ?? {};
}

describe('Android target API level', () => {
  it('targets at least the API level Play requires for a new submission', () => {
    const android = androidBuildProperties();
    expect(android['targetSdkVersion']).toBeGreaterThanOrEqual(PLAY_MINIMUM_TARGET_API);
  });

  it('compiles against at least the API level it targets', () => {
    const android = androidBuildProperties();
    expect(Number(android['compileSdkVersion'])).toBeGreaterThanOrEqual(
      Number(android['targetSdkVersion']),
    );
  });
});
