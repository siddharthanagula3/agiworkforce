const { withDangerousMod, createRunOncePlugin } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PLUGIN_NAME = 'agi-tablet-orientation-plugin';
const PLUGIN_VERSION = '1.0.0';

const PATCH_MARKER = 'applyScreenOrientation';
const SIZE_CLASS_MARKER = 'appliedLargeScreen';

const IMPORTS = [
  'import android.content.pm.ActivityInfo',
  'import android.content.res.Configuration',
];

const LARGE_SCREEN_MIN_WIDTH = 'private const val LARGE_SCREEN_MIN_WIDTH_DP = 600\n\n';

const ON_CREATE_ORIENTATION = '    applyScreenOrientation(resources.configuration)\n';

const APPLY_SCREEN_ORIENTATION = `  private var appliedLargeScreen: Boolean? = null

  private fun applyScreenOrientation(configuration: Configuration) {
    val largeScreen = configuration.smallestScreenWidthDp >= LARGE_SCREEN_MIN_WIDTH_DP
    if (largeScreen == appliedLargeScreen) return
    appliedLargeScreen = largeScreen
    requestedOrientation =
      if (largeScreen) {
        ActivityInfo.SCREEN_ORIENTATION_FULL_USER
      } else {
        ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
      }
  }
`;

const METHODS = `
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    applyScreenOrientation(newConfig)
  }

${APPLY_SCREEN_ORIENTATION}`;

const EARLIER_APPLY_SCREEN_ORIENTATION =
  /^ {2}private fun applyScreenOrientation\(configuration: Configuration\) \{\n[\s\S]*?\n {2}\}\n/m;

function upgradeMainActivity(contents) {
  const earlier = contents.match(EARLIER_APPLY_SCREEN_ORIENTATION);
  if (!earlier) {
    throw new Error(
      `${PLUGIN_NAME}: MainActivity.kt has an applyScreenOrientation this plugin cannot upgrade; run expo prebuild --clean`,
    );
  }
  return contents.replace(earlier[0], APPLY_SCREEN_ORIENTATION);
}

function patchMainActivity(contents) {
  if (contents.includes(SIZE_CLASS_MARKER)) return contents;
  if (contents.includes(PATCH_MARKER)) return upgradeMainActivity(contents);

  let out = contents;

  const missingImports = IMPORTS.filter((imp) => !out.includes(imp));
  if (missingImports.length > 0) {
    const firstImport = out.match(/^import .*$/m);
    if (!firstImport) {
      throw new Error(`${PLUGIN_NAME}: MainActivity.kt has no import block to anchor on`);
    }
    out = out.replace(firstImport[0], `${firstImport[0]}\n${missingImports.join('\n')}`);
  }

  const activityClass = out.match(/^class MainActivity\b/m);
  if (!activityClass) {
    throw new Error(`${PLUGIN_NAME}: could not find class MainActivity in MainActivity.kt`);
  }
  out = out.replace(activityClass[0], `${LARGE_SCREEN_MIN_WIDTH}${activityClass[0]}`);

  const superOnCreate = out.match(/^(\s*)super\.onCreate\([^)]*\)/m);
  if (!superOnCreate) {
    throw new Error(`${PLUGIN_NAME}: could not find super.onCreate(...) in MainActivity.kt`);
  }
  out = out.replace(superOnCreate[0], `${ON_CREATE_ORIENTATION}${superOnCreate[0]}`);

  const classEnd = out.match(/\n\}\s*$/);
  if (!classEnd) {
    throw new Error(`${PLUGIN_NAME}: could not find the end of class MainActivity`);
  }
  return `${out.slice(0, classEnd.index)}\n${METHODS}}\n`;
}

function withTabletOrientation(config) {
  return withDangerousMod(config, [
    'android',
    async (c) => {
      const mainActivityPath = path.join(
        c.modRequest.projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'agiworkforce',
        'app',
        'MainActivity.kt',
      );
      if (!fs.existsSync(mainActivityPath)) {
        throw new Error(`${PLUGIN_NAME}: MainActivity.kt not found at ${mainActivityPath}`);
      }
      const contents = fs.readFileSync(mainActivityPath, 'utf8');
      fs.writeFileSync(mainActivityPath, patchMainActivity(contents));
      return c;
    },
  ]);
}

module.exports = createRunOncePlugin(withTabletOrientation, PLUGIN_NAME, PLUGIN_VERSION);
module.exports.patchMainActivity = patchMainActivity;
