/* eslint-disable @typescript-eslint/no-require-imports */
import fs from 'fs';
import path from 'path';

const { addShortcutsMetaData, renderShortcuts } =
  require('../native/android/withAGIShortcuts.cjs') as {
    addShortcutsMetaData: (manifest: Manifest) => Manifest;
    renderShortcuts: (template: string, packageName: string | undefined) => string;
  };

interface Entry {
  $: Record<string, string>;
}
interface Manifest {
  manifest: {
    application?: Array<{
      activity?: Array<Entry & { 'meta-data'?: Entry[] }>;
    }>;
  };
}

const SHORTCUTS_DIR = path.join(__dirname, '..', 'native', 'android', 'shortcuts');

function stockManifest(): Manifest {
  return {
    manifest: {
      application: [
        {
          activity: [
            { $: { 'android:name': '.MainActivity' } },
            { $: { 'android:name': 'expo.modules.devlauncher.DevLauncherActivity' } },
          ],
        },
      ],
    },
  };
}

describe('withAGIShortcuts', () => {
  it('points the launcher activity at the shortcuts resource once', () => {
    const once = addShortcutsMetaData(stockManifest());
    const twice = addShortcutsMetaData(once);
    const main = twice.manifest.application?.[0]?.activity?.[0];

    expect(main?.['meta-data']).toEqual([
      {
        $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/agi_shortcuts' },
      },
    ]);
  });

  it('refuses a manifest without the launcher activity instead of shipping no shortcuts', () => {
    expect(() => addShortcutsMetaData({ manifest: { application: [{ activity: [] }] } })).toThrow(
      /MainActivity/,
    );
  });

  it('opens new chat, voice and camera through the same links as the home widget', () => {
    const template = fs.readFileSync(path.join(SHORTCUTS_DIR, 'agi_shortcuts.xml'), 'utf8');
    const rendered = renderShortcuts(template, 'com.agiworkforce.app');
    const widget = fs.readFileSync(
      path.join(__dirname, '..', 'native', 'android', 'widget', 'AGIQuickActionsWidget.kt'),
      'utf8',
    );

    for (const verb of ['chat', 'voice', 'camera']) {
      expect(rendered).toContain(`android:data="agiworkforce://intent/${verb}"`);
      expect(widget).toContain(`link(context, "${verb}"`);
    }
    expect(rendered).not.toContain('__PACKAGE__');
    expect(rendered).toContain('android:targetClass="com.agiworkforce.app.MainActivity"');
  });

  it('declares every label and icon the shortcuts reference', () => {
    const template = fs.readFileSync(path.join(SHORTCUTS_DIR, 'agi_shortcuts.xml'), 'utf8');
    const values = fs.readFileSync(path.join(SHORTCUTS_DIR, 'agi_shortcut_values.xml'), 'utf8');

    for (const [, name] of template.matchAll(/@string\/([a-z_]+)/g)) {
      expect(values).toContain(`name="${name}"`);
    }
    for (const [, name] of template.matchAll(/@drawable\/([a-z_]+)/g)) {
      expect(fs.existsSync(path.join(SHORTCUTS_DIR, `${name}.xml`))).toBe(true);
    }
  });

  it('is registered in the app config', () => {
    const appConfig = fs.readFileSync(path.join(__dirname, '..', 'app.config.js'), 'utf8');
    expect(appConfig).toContain("'./native/android/withAGIShortcuts.cjs'");
  });
});
