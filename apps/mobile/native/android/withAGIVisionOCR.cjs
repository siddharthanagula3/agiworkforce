// Expo config plugin: wires Android VisionOCR native module into the generated android/ project.
//
// What this does at prebuild time:
//   1. Adds com.google.mlkit:text-recognition:16.0.0 to android/app/build.gradle dependencies.
//      ML Kit Text Recognition includes Latin script (English + 60+ languages) bundled at compile
//      time — no model download needed at runtime for Latin. CJK/Devanagari require separate
//      script-specific deps (not added here — Latin recognizer covers our v1 use-cases).
//      Coord from: https://dl.google.com/dl/android/maven2/com/google/mlkit/text-recognition/maven-metadata.xml
//   2. Copies AGIVisionOCR.kt + AGIVisionOCRPackage.kt into the generated source tree.
//   3. Registers AGIVisionOCRPackage() in MainApplication.kt's getPackages() list.
//
// Run: expo prebuild --platform android (or via EAS build)

const {
  withAppBuildGradle,
  withDangerousMod,
  createRunOncePlugin,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PLUGIN_NAME = 'agi-visionocr-plugin';
const PLUGIN_VERSION = '1.0.0';

// ML Kit Text Recognition v16.0.0 — latest stable as of Jan 2026.
// Latin recognizer is included by default; no extra classifier download required.
const VISIONOCR_DEP = "implementation 'com.google.mlkit:text-recognition:16.0.0'";
const VISIONOCR_DEP_MARKER = 'com.google.mlkit:text-recognition';

const PACKAGE_IMPORT = 'import com.agiworkforce.app.native.AGIVisionOCRPackage';
const PACKAGE_REGISTRATION = 'add(AGIVisionOCRPackage())';

const NATIVE_SRC_DIR = __dirname;
const KOTLIN_FILES = ['AGIVisionOCR.kt', 'AGIVisionOCRPackage.kt'];

/** Step 1 — inject gradle dependency into android/app/build.gradle */
function withVisionOCRGradle(config) {
  return withAppBuildGradle(config, (c) => {
    const gradle = c.modResults.contents;
    if (gradle.includes(VISIONOCR_DEP_MARKER)) return c;
    c.modResults.contents = gradle.replace(
      /dependencies\s*\{/,
      `dependencies {\n    ${VISIONOCR_DEP}`,
    );
    return c;
  });
}

/** Step 2 — copy Kotlin source files and patch MainApplication.kt */
function withVisionOCRMainApplication(config) {
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

function withAGIVisionOCR(config) {
  config = withVisionOCRGradle(config);
  config = withVisionOCRMainApplication(config);
  return config;
}

module.exports = createRunOncePlugin(withAGIVisionOCR, PLUGIN_NAME, PLUGIN_VERSION);
