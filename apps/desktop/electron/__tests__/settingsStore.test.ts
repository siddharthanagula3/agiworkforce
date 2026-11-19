import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SHORTCUTS } from '../garnishCore';

let userData = '';

vi.mock('electron', () => ({
  app: { getPath: () => userData },
}));

type Store = typeof import('../settingsStore');

async function freshStore(): Promise<Store> {
  vi.resetModules();
  return import('../settingsStore');
}

function usableDirectory(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'agi-settings-store-'));
}

function missingDirectory(): string {
  return path.join(usableDirectory(), 'gone');
}

describe('the settings file', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    userData = usableDirectory();
  });

  it('keeps a change on disk and in memory when the file is written', async () => {
    const store = await freshStore();

    store.saveSettingsDurably({ showInMenuBar: false });

    expect(store.getPreferences().showInMenuBar).toBe(false);
    const onDisk = JSON.parse(readFileSync(store.settingsFilePath(), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(onDisk['showInMenuBar']).toBe(false);
    expect(readdirSync(userData)).toEqual(['settings.json']);
  });

  it('refuses a change the file could not keep, and keeps reporting the saved value', async () => {
    const store = await freshStore();
    store.saveSettingsDurably({ quickAskShortcut: DEFAULT_SHORTCUTS.quickAskShortcut });
    const before = store.getSettings();
    userData = missingDirectory();

    expect(() => store.saveSettingsDurably({ showInMenuBar: false })).toThrow(
      /could not be saved on this computer/u,
    );

    expect(store.getPreferences().showInMenuBar).toBe(before.showInMenuBar);
    expect(store.getSettings()).toEqual(before);
  });

  it('still applies a cosmetic change for the session when the file cannot be written', async () => {
    const store = await freshStore();
    userData = missingDirectory();

    expect(() => store.saveSettings({ zoomLevel: 1 })).not.toThrow();

    expect(store.getPreferences().zoomLevel).toBe(1);
  });

  it('does not leave a half-written file behind when the write is refused', async () => {
    const directory = usableDirectory();
    userData = directory;
    const store = await freshStore();
    store.saveSettingsDurably({ showInMenuBar: false });
    const saved = readFileSync(store.settingsFilePath(), 'utf8');

    userData = missingDirectory();
    expect(() => store.saveSettingsDurably({ showInMenuBar: true })).toThrow();

    expect(readFileSync(path.join(directory, 'settings.json'), 'utf8')).toBe(saved);
  });
});
