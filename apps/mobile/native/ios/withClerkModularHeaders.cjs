
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
