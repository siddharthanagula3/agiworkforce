// Expo config plugin: wires Android AICore native module into the generated android/ project.
//
// What this does at prebuild time:
//   1. Adds com.google.mlkit:genai-prompt to android/app/build.gradle dependencies.
//      genai-prompt exposes Generation.getClient() / GenerativeModel, ML Kit's real
//      chat/prompt inference surface over Gemini Nano via AICore (transitively pulls in
//      genai-common for FeatureStatus/DownloadStatus/StreamingCallback).
//   2. Copies AGIAICoreModule.kt + AGIAICorePackage.kt into the generated source tree.
//   3. Registers AGIAICorePackage() in MainApplication.kt's getPackages() list.
//
// Run: expo prebuild --platform android (or via EAS build)
// After prebuild the android/ dir is generated and these changes are applied.

const {
  withAppBuildGradle,
  withDangerousMod,
  createRunOncePlugin,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PLUGIN_NAME = 'agi-aicore-plugin';
const PLUGIN_VERSION = '1.0.0';

// Public ML Kit GenAI Prompt artifact on Google Maven — provides Gemini Nano
// on-device inference on AICore-capable devices (Pixel 8+, Galaxy S24+).
// Source: https://dl.google.com/dl/android/maven2/com/google/mlkit/genai-prompt/maven-metadata.xml
const AICORE_DEP = "implementation 'com.google.mlkit:genai-prompt:1.0.0-beta2'";
const AICORE_DEP_MARKER = 'com.google.mlkit:genai-prompt';

const PACKAGE_IMPORT = 'import com.agiworkforce.app.native.AGIAICorePackage';
const PACKAGE_REGISTRATION = 'add(AGIAICorePackage())';

const NATIVE_SRC_DIR = __dirname;
const KOTLIN_FILES = ['AGIAICoreModule.kt', 'AGIAICorePackage.kt'];

/** Step 1 — inject gradle dependency into android/app/build.gradle */
function withAICoreGradle(config) {
  return withAppBuildGradle(config, (c) => {
    const gradle = c.modResults.contents;
    if (gradle.includes(AICORE_DEP_MARKER)) return c;
    c.modResults.contents = gradle.replace(
      /dependencies\s*\{/,
      `dependencies {\n    ${AICORE_DEP}`,
    );
    return c;
  });
}

/** Step 2 — copy Kotlin source files and patch MainApplication.kt */
function withAICoreMainApplication(config) {
  return withDangerousMod(config, [
    'android',
    async (c) => {
      const projectRoot = c.modRequest.projectRoot;
      const androidRoot = path.join(projectRoot, 'android');
      const packagePath = path.join(
        androidRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'agiworkforce',
        'app',
        'native',
      );

      if (!fs.existsSync(packagePath)) {
        fs.mkdirSync(packagePath, { recursive: true });
      }
      for (const fileName of KOTLIN_FILES) {
        const src = path.join(NATIVE_SRC_DIR, fileName);
        const dest = path.join(packagePath, fileName);
        if (fs.existsSync(src) && !fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
        }
      }

      const mainAppPath = path.join(
        androidRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'agiworkforce',
        'app',
        'MainApplication.kt',
      );

      if (!fs.existsSync(mainAppPath)) return c;

      let mainApp = fs.readFileSync(mainAppPath, 'utf8');

      if (!mainApp.includes(PACKAGE_IMPORT)) {
        mainApp = mainApp.replace(
          /^(package com\.agiworkforce\.app\s*\n)/m,
          `$1\n${PACKAGE_IMPORT}\n`,
        );
      }

      if (!mainApp.includes(PACKAGE_REGISTRATION)) {
        // React Native MainApplication.kt template getPackages() uses .apply { ... }.
        mainApp = mainApp.replace(
          /(getPackages\(\)[^{]*\{[^}]*apply\s*\{)/s,
          `$1\n      ${PACKAGE_REGISTRATION}`,
        );
      }

      fs.writeFileSync(mainAppPath, mainApp, 'utf8');
      return c;
    },
  ]);
}

function withAGIAICore(config) {
  config = withAICoreGradle(config);
  config = withAICoreMainApplication(config);
  return config;
}

module.exports = createRunOncePlugin(withAGIAICore, PLUGIN_NAME, PLUGIN_VERSION);
