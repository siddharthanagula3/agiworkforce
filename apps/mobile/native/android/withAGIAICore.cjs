// Expo config plugin: wires Android AICore native module into the generated android/ project.
//
// What this does at prebuild time:
//   1. Adds com.google.mediapipe:tasks-genai to android/app/build.gradle dependencies.
//      (real LlmInference/LlmInferenceSession API — see native/android/AGIAICoreModule.kt
//      for why the earlier com.google.mlkit:genai-common dependency was replaced: that
//      artifact never exposed a generic chat/completion surface.)
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
const PLUGIN_VERSION = '2.0.0';

// Latest tasks-genai release on Google's Maven (verified via
// https://dl.google.com/android/maven2/com/google/mediapipe/group-index.xml).
// Provides the LlmInference/LlmInferenceSession API for on-device Gemma/Llama/
// Qwen/Phi .task model inference — used by Google's own mediapipe-samples and
// google-ai-edge/gallery apps.
const AICORE_DEP = "implementation 'com.google.mediapipe:tasks-genai:0.10.35'";
const AICORE_DEP_MARKER = 'com.google.mediapipe:tasks-genai';

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
