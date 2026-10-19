const {
  withAndroidManifest,
  withDangerousMod,
  createRunOncePlugin,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PLUGIN_NAME = 'agi-shortcuts-android-plugin';
const PLUGIN_VERSION = '1.0.0';
const SOURCE_DIR = path.join(__dirname, 'shortcuts');
const SHORTCUTS_FILE = 'agi_shortcuts.xml';
const SHORTCUTS_META_DATA = 'android.app.shortcuts';
const RESOURCES = [
  ['agi_shortcut_values.xml', 'values'],
  ['agi_shortcut_new_chat.xml', 'drawable'],
  ['agi_shortcut_voice.xml', 'drawable'],
  ['agi_shortcut_camera.xml', 'drawable'],
];

function renderShortcuts(template, packageName) {
  if (!packageName) throw new Error(`${PLUGIN_NAME}: android.package is not set`);
  return template.replaceAll('__PACKAGE__', packageName);
}

function addShortcutsMetaData(manifest) {
  const application = manifest.manifest.application?.[0];
  if (!application) throw new Error(`${PLUGIN_NAME}: the manifest has no application`);
  const mainActivity = (application.activity ?? []).find(
    (activity) => activity.$['android:name'] === '.MainActivity',
  );
  if (!mainActivity) throw new Error(`${PLUGIN_NAME}: the manifest has no .MainActivity`);
  mainActivity['meta-data'] = (mainActivity['meta-data'] ?? []).filter(
    (entry) => entry.$['android:name'] !== SHORTCUTS_META_DATA,
  );
  mainActivity['meta-data'].push({
    $: { 'android:name': SHORTCUTS_META_DATA, 'android:resource': '@xml/agi_shortcuts' },
  });
  return manifest;
}

function withShortcutSources(config) {
  return withDangerousMod(config, [
    'android',
    async (c) => {
      const res = path.join(c.modRequest.projectRoot, 'android', 'app', 'src', 'main', 'res');
      const xmlDir = path.join(res, 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, SHORTCUTS_FILE),
        renderShortcuts(
          fs.readFileSync(path.join(SOURCE_DIR, SHORTCUTS_FILE), 'utf8'),
          c.android?.package,
        ),
      );
      for (const [fileName, folder] of RESOURCES) {
        const destination = path.join(res, folder);
        fs.mkdirSync(destination, { recursive: true });
        fs.copyFileSync(path.join(SOURCE_DIR, fileName), path.join(destination, fileName));
      }
      return c;
    },
  ]);
}

function withShortcutsMetaData(config) {
  return withAndroidManifest(config, (c) => {
    c.modResults = addShortcutsMetaData(c.modResults);
    return c;
  });
}

function withAGIShortcuts(config) {
  return withShortcutsMetaData(withShortcutSources(config));
}

module.exports = createRunOncePlugin(withAGIShortcuts, PLUGIN_NAME, PLUGIN_VERSION);
module.exports.addShortcutsMetaData = addShortcutsMetaData;
module.exports.renderShortcuts = renderShortcuts;
