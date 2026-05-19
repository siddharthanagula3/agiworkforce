// Expo config plugin: wires iOS native Swift/ObjC modules into the generated Xcode project.
//
// Modules wired:
//   - AGIFoundationModels (.m + .swift) — Apple Foundation Models (iOS 26+)
//   - AGITranslate (.m + .swift) — Apple Translate framework (iOS 17.4+)
//   - AGIVisionOCR (.m + .swift) — Apple Vision text recognition (iOS 13+)
//   - AGIAppIntents/*.swift — App Intents + Siri phrases (iOS 16+)
//   - AGIAppIntents/en.lproj/AppShortcuts.xcstrings — localization for Siri phrases
//
// All Swift modules use RCT_EXTERN_MODULE ObjC bridges so React Native's bridge
// scanner registers them automatically — no manual registration list needed.
// The plugin's only job is to ensure Xcode includes these files in the target
// at prebuild time.
//
// Run: expo prebuild --platform ios (or via EAS build)

const { withXcodeProject, withDangerousMod, createRunOncePlugin } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PLUGIN_NAME = 'agi-native-modules-ios-plugin';
const PLUGIN_VERSION = '1.0.0';

const NATIVE_IOS_SRC = __dirname;

// Files relative to native/ios/
const TOP_LEVEL_FILES = [
  'AGIFoundationModels.m',
  'AGIFoundationModels.swift',
  'AGITranslate.m',
  'AGITranslate.swift',
  'AGIVisionOCR.m',
  'AGIVisionOCR.swift',
];

// Files relative to native/ios/AGIAppIntents/
const APP_INTENTS_FILES = [
  'AGIIntentDispatch.swift',
  'AnalyzeImageIntent.swift',
  'AppShortcuts.swift',
  'AskAGIIntent.swift',
  'ScanIntent.swift',
  'SetReminderIntent.swift',
  'StartChatIntent.swift',
  'SummarizeIntent.swift',
  'TranscribeIntent.swift',
  'TranslateIntent.swift',
];

// Localization resources relative to native/ios/AGIAppIntents/en.lproj/
const LPROJ_FILES = ['AppShortcuts.xcstrings'];

/** Step 1 — copy source files into the generated ios/<AppName>/ directory */
function withCopyIOSSources(config) {
  return withDangerousMod(config, [
    'ios',
    async (c) => {
      const projectRoot = c.modRequest.projectRoot;
      const appName = c.modRequest.projectName ?? 'agiworkforce';
      const iosAppDir = path.join(projectRoot, 'ios', appName);

      // Ensure AGIAppIntents subdir exists
      const appIntentsDir = path.join(iosAppDir, 'AGIAppIntents');
      const lprojDir = path.join(appIntentsDir, 'en.lproj');
      [iosAppDir, appIntentsDir, lprojDir].forEach((d) => {
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      });

      // Copy top-level Swift + ObjC bridge files
      for (const fileName of TOP_LEVEL_FILES) {
        const src = path.join(NATIVE_IOS_SRC, fileName);
        const dest = path.join(iosAppDir, fileName);
        if (fs.existsSync(src) && !fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
        }
      }

      // Copy AGIAppIntents Swift files
      for (const fileName of APP_INTENTS_FILES) {
        const src = path.join(NATIVE_IOS_SRC, 'AGIAppIntents', fileName);
        const dest = path.join(appIntentsDir, fileName);
        if (fs.existsSync(src) && !fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
        }
      }

      // Copy localization resources
      for (const fileName of LPROJ_FILES) {
        const src = path.join(NATIVE_IOS_SRC, 'AGIAppIntents', 'en.lproj', fileName);
        const dest = path.join(lprojDir, fileName);
        if (fs.existsSync(src) && !fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
        }
      }

      return c;
    },
  ]);
}

/**
 * Step 2 — register all copied files with the Xcode project so they are
 * compiled into the main app target.
 *
 * withXcodeProject gives us the parsed xcodeproj object from xcode npm package.
 * We use addSourceFile for Swift/ObjC sources and addResourceFile for xcstrings.
 */
function withXcodeSourceFiles(config) {
  return withXcodeProject(config, (c) => {
    const xcodeProject = c.modResults;

    // Helper: safe add source file (skips if already present)
    function safeAddSource(relPath) {
      const existingRefs = xcodeProject.pbxFileReferenceSection();
      const baseName = path.basename(relPath);
      const alreadyPresent = Object.values(existingRefs).some(
        (f) =>
          f &&
          typeof f === 'object' &&
          f.path &&
          (f.path === baseName || f.path === `"${baseName}"`),
      );
      if (alreadyPresent) return;
      xcodeProject.addSourceFile(relPath, { target: xcodeProject.getFirstTarget().uuid });
    }

    function safeAddResource(relPath) {
      const existingRefs = xcodeProject.pbxFileReferenceSection();
      const baseName = path.basename(relPath);
      const alreadyPresent = Object.values(existingRefs).some(
        (f) =>
          f &&
          typeof f === 'object' &&
          f.path &&
          (f.path === baseName || f.path === `"${baseName}"`),
      );
      if (alreadyPresent) return;
      xcodeProject.addResourceFile(relPath, { target: xcodeProject.getFirstTarget().uuid });
    }

    // Top-level Swift + ObjC files — paths relative to ios/<AppName>/
    for (const fileName of TOP_LEVEL_FILES) {
      safeAddSource(fileName);
    }

    // AGIAppIntents Swift files — paths relative to ios/<AppName>/AGIAppIntents/
    for (const fileName of APP_INTENTS_FILES) {
      safeAddSource(`AGIAppIntents/${fileName}`);
    }

    // Localization xcstrings resource
    for (const fileName of LPROJ_FILES) {
      safeAddResource(`AGIAppIntents/en.lproj/${fileName}`);
    }

    return c;
  });
}

function withAGINativeModulesIOS(config) {
  // Copy sources first, then register with Xcode project
  config = withCopyIOSSources(config);
  config = withXcodeSourceFiles(config);
  return config;
}

module.exports = createRunOncePlugin(withAGINativeModulesIOS, PLUGIN_NAME, PLUGIN_VERSION);
