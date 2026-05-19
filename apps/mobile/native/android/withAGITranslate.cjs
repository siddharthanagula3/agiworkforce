// Expo config plugin: wires Android Translate native module into the generated android/ project.
//
// What this does at prebuild time:
//   1. Adds com.google.mlkit:translate:17.0.3 to android/app/build.gradle dependencies.
//      ML Kit on-device translation: fully offline once language model is downloaded (~30 MB/pair).
//      Coord from: https://dl.google.com/dl/android/maven2/com/google/mlkit/translate/maven-metadata.xml
//   2. Copies AGITranslateModule.kt + AGITranslatePackage.kt into the generated source tree.
//   3. Registers AGITranslatePackage() in MainApplication.kt's getPackages() list.
//
// Run: expo prebuild --platform android (or via EAS build)

const {
  withAppBuildGradle,
  withDangerousMod,
  createRunOncePlugin,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PLUGIN_NAME = 'agi-translate-plugin';
const PLUGIN_VERSION = '1.0.0';

// ML Kit on-device Translation (2024-01; stable public release).
const TRANSLATE_DEP = "implementation 'com.google.mlkit:translate:17.0.3'";
const TRANSLATE_DEP_MARKER = 'com.google.mlkit:translate';

const PACKAGE_IMPORT = 'import com.agiworkforce.app.native.AGITranslatePackage';
const PACKAGE_REGISTRATION = 'add(AGITranslatePackage())';

const NATIVE_SRC_DIR = __dirname;
const KOTLIN_FILES = ['AGITranslateModule.kt', 'AGITranslatePackage.kt'];

/** Step 1 — inject gradle dependency into android/app/build.gradle */
function withTranslateGradle(config) {
  return withAppBuildGradle(config, (c) => {
    const gradle = c.modResults.contents;
    if (gradle.includes(TRANSLATE_DEP_MARKER)) return c;
    c.modResults.contents = gradle.replace(
      /dependencies\s*\{/,
      `dependencies {\n    ${TRANSLATE_DEP}`,
    );
    return c;
  });
}

/** Step 2 — copy Kotlin source files and patch MainApplication.kt */
function withTranslateMainApplication(config) {
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

function withAGITranslate(config) {
  config = withTranslateGradle(config);
  config = withTranslateMainApplication(config);
  return config;
}

module.exports = createRunOncePlugin(withAGITranslate, PLUGIN_NAME, PLUGIN_VERSION);
