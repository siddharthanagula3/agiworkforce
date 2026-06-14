// Expo config plugin: opt the Clerk-pulled Google pods into modular headers.
//
// Clerk's native iOS SDK (clerk-ios, via @clerk/expo) transitively pulls in
// AppCheckCore, which depends on GoogleUtilities + RecaptchaInterop. Those pods
// do not define modules, so they cannot link as STATIC libraries (this app's
// default linkage — switching the whole app to use_frameworks! would risk the
// heavy C++ native modules like react-native-executorch). CocoaPods' own error
// recommends `:modular_headers => true` for these specific dependencies, which
// generates their module maps without changing global linkage.
//
// Run: expo prebuild --platform ios (or via expo run:ios / EAS build)

const { withDangerousMod, createRunOncePlugin } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PLUGIN_NAME = 'agi-clerk-modular-headers';
const PLUGIN_VERSION = '1.0.0';
const MARKER = '# agi-clerk-modular-headers';

const INJECT = [
  '',
  `  ${MARKER} — module maps for Clerk's static-linked Google deps`,
  "  pod 'GoogleUtilities', :modular_headers => true",
  "  pod 'RecaptchaInterop', :modular_headers => true",
  "  pod 'AppCheckCore', :modular_headers => true",
].join('\n');

function withClerkModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfile, 'utf8');
      if (!contents.includes(MARKER)) {
        // Insert right after `use_expo_modules!` inside the app target.
        const replaced = contents.replace(
          /(target '[^']+' do\n {2}use_expo_modules!\n)/,
          `$1${INJECT}\n`,
        );
        if (replaced === contents) {
          throw new Error('[withClerkModularHeaders] could not find the target anchor in Podfile');
        }
        fs.writeFileSync(podfile, replaced, 'utf8');
      }
      return cfg;
    },
  ]);
}

module.exports = createRunOncePlugin(withClerkModularHeaders, PLUGIN_NAME, PLUGIN_VERSION);
