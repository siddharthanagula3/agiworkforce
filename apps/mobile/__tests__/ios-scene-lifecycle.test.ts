import config from '../app.config.js';
import expoPackage from 'expo/package.json';

/**
 * An app built with the iOS 27 SDK traps in UIKit
 * (`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`) before
 * JavaScript loads unless it adopts the scene lifecycle. The SDK 57 template
 * still creates its window in the AppDelegate, so `expo-build-properties`
 * has to switch the project to Expo's scene delegate. The crash only shows
 * on a device or simulator running iOS 27, never in a unit test or CI.
 *
 * SDK 58's template adopts scenes itself and the flag becomes a no-op.
 */
const TEMPLATE_ADOPTS_SCENES_FROM_SDK = 58;

function iosBuildProperties(): Record<string, unknown> {
  const resolved = typeof config === 'function' ? config({ config: {} }) : config;
  const app = (resolved as { expo?: unknown }).expo ?? resolved;
  const plugins = (app as { plugins?: unknown[] }).plugins ?? [];
  const entry = plugins.find(
    (plugin): plugin is [string, { ios?: Record<string, unknown> }] =>
      Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
  );
  if (!entry) throw new Error('expo-build-properties is not configured');
  return entry[1].ios ?? {};
}

const sdkMajor = Number(expoPackage.version.split('.')[0]);

describe('iOS scene lifecycle', () => {
  (sdkMajor < TEMPLATE_ADOPTS_SCENES_FROM_SDK ? it : it.skip)(
    'adopts the scene lifecycle so the app launches on iOS 27',
    () => {
      expect(iosBuildProperties()['enableSceneSupport']).toBe(true);
    },
  );
});
