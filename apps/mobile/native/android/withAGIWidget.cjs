const {
  withAndroidManifest,
  withDangerousMod,
  createRunOncePlugin,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PLUGIN_NAME = 'agi-widget-android-plugin';
const PLUGIN_VERSION = '1.0.0';
const SOURCE_DIR = path.join(__dirname, 'widget');
const RECEIVER_NAME = '.native.AGIQuickActionsWidget';
const RESOURCES = [
  ['agi_quick_actions_widget.xml', 'layout'],
  ['agi_quick_actions_widget_info.xml', 'xml'],
  ['agi_widget_background.xml', 'drawable'],
  ['agi_widget_values.xml', 'values'],
];

function withWidgetSources(config) {
  return withDangerousMod(config, [
    'android',
    async (c) => {
      const main = path.join(c.modRequest.projectRoot, 'android', 'app', 'src', 'main');
      const kotlinDir = path.join(main, 'java', 'com', 'agiworkforce', 'app', 'native');
      fs.mkdirSync(kotlinDir, { recursive: true });
      fs.copyFileSync(
        path.join(SOURCE_DIR, 'AGIQuickActionsWidget.kt'),
        path.join(kotlinDir, 'AGIQuickActionsWidget.kt'),
      );
      for (const [fileName, folder] of RESOURCES) {
        const destination = path.join(main, 'res', folder);
        fs.mkdirSync(destination, { recursive: true });
        fs.copyFileSync(path.join(SOURCE_DIR, fileName), path.join(destination, fileName));
      }
      return c;
    },
  ]);
}

function withWidgetReceiver(config) {
  return withAndroidManifest(config, (c) => {
    const application = c.modResults.manifest.application?.[0];
    if (!application) throw new Error(`${PLUGIN_NAME}: the manifest has no application`);
    application.receiver = (application.receiver ?? []).filter(
      (receiver) => receiver.$['android:name'] !== RECEIVER_NAME,
    );
    application.receiver.push({
      $: {
        'android:name': RECEIVER_NAME,
        'android:exported': 'false',
        'android:label': '@string/agi_widget_label',
      },
      'intent-filter': [
        { action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.appwidget.provider',
            'android:resource': '@xml/agi_quick_actions_widget_info',
          },
        },
      ],
    });
    return c;
  });
}

function withAGIWidget(config) {
  return withWidgetReceiver(withWidgetSources(config));
}

module.exports = createRunOncePlugin(withAGIWidget, PLUGIN_NAME, PLUGIN_VERSION);
