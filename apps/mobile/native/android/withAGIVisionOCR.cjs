
const {
  withAppBuildGradle,
  withDangerousMod,
  createRunOncePlugin,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PLUGIN_NAME = 'agi-visionocr-plugin';
const PLUGIN_VERSION = '1.0.0';

const VISIONOCR_DEP = "implementation 'com.google.mlkit:text-recognition:16.0.0'";
const VISIONOCR_DEP_MARKER = 'com.google.mlkit:text-recognition';

const PACKAGE_IMPORT = 'import com.agiworkforce.app.native.AGIVisionOCRPackage';
const PACKAGE_REGISTRATION = 'add(AGIVisionOCRPackage())';

const NATIVE_SRC_DIR = __dirname;
const KOTLIN_FILES = ['AGIVisionOCR.kt', 'AGIVisionOCRPackage.kt'];

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
