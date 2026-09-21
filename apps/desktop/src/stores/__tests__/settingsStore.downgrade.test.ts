import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsBackupKey, useSettingsStore } from '../settingsStore';

vi.mock('../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tauri-mock')>()),
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauriContext: vi.fn(() => false),
}));

const STORE_KEY = 'agiworkforce-settings';
const THIS_VERSION = 28;
const NEWER_VERSION = 99;

function persisted(version: number, uiScale: number, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    state: { windowPreferences: { uiScale, theme: 'dark' }, ...extra },
    version,
  });
}

function uiScale(): number | undefined {
  return useSettingsStore.getState().windowPreferences.uiScale;
}

beforeEach(() => {
  window.localStorage.clear();
  useSettingsStore.setState((state) => ({
    windowPreferences: { ...state.windowPreferences, uiScale: 100 },
  }));
});

describe('settings written by a build newer than this one', () => {
  it('reads what this build understands, and only that', async () => {
    window.localStorage.setItem(
      STORE_KEY,
      persisted(NEWER_VERSION, 55, { chatPreferences: { sendShortcut: 'chord+opt+k' } }),
    );

    await useSettingsStore.persist.rehydrate();

    expect(uiScale()).toBe(100);
    expect(useSettingsStore.getState().chatPreferences.sendShortcut).not.toBe('chord+opt+k');
  });

  it('keeps the newer state whole, under its own version', async () => {
    window.localStorage.setItem(
      STORE_KEY,
      persisted(NEWER_VERSION, 55, { unknownToThisBuild: { a: 1 } }),
    );

    await useSettingsStore.persist.rehydrate();

    expect(
      JSON.parse(window.localStorage.getItem(settingsBackupKey(NEWER_VERSION)) ?? 'null'),
    ).toEqual({
      version: NEWER_VERSION,
      state: {
        windowPreferences: { uiScale: 55, theme: 'dark' },
        unknownToThisBuild: { a: 1 },
      },
    });
  });

  it('hydrates rather than failing when the state cannot be set aside', async () => {
    window.localStorage.setItem(STORE_KEY, persisted(NEWER_VERSION, 55));
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await useSettingsStore.persist.rehydrate();

    expect(uiScale()).toBe(100);
    expect(warn).toHaveBeenCalled();
    setItem.mockRestore();
    warn.mockRestore();
  });
});

describe('returning to the build that was downgraded from', () => {
  it('restores what it set aside instead of migrating the older build forward', async () => {
    window.localStorage.setItem(settingsBackupKey(THIS_VERSION), persisted(THIS_VERSION, 77));
    window.localStorage.setItem(STORE_KEY, persisted(THIS_VERSION - 1, 42));

    await useSettingsStore.persist.rehydrate();

    expect(uiScale()).toBe(77);
  });

  it('restores once, so a later downgrade sets aside the state that is current then', async () => {
    window.localStorage.setItem(settingsBackupKey(THIS_VERSION), persisted(THIS_VERSION, 77));
    window.localStorage.setItem(STORE_KEY, persisted(THIS_VERSION - 1, 42));

    await useSettingsStore.persist.rehydrate();
    expect(window.localStorage.getItem(settingsBackupKey(THIS_VERSION))).toBeNull();

    window.localStorage.setItem(STORE_KEY, persisted(THIS_VERSION - 1, 42));
    await useSettingsStore.persist.rehydrate();

    expect(uiScale()).toBe(42);
  });

  it('migrates the older build forward when nothing was set aside', async () => {
    window.localStorage.setItem(STORE_KEY, persisted(THIS_VERSION - 1, 42));

    await useSettingsStore.persist.rehydrate();

    expect(uiScale()).toBe(42);
  });

  it('ignores a set-aside blob that does not say it is this version', async () => {
    window.localStorage.setItem(settingsBackupKey(THIS_VERSION), persisted(NEWER_VERSION, 77));
    window.localStorage.setItem(STORE_KEY, persisted(THIS_VERSION - 1, 42));

    await useSettingsStore.persist.rehydrate();

    expect(uiScale()).toBe(42);
  });

  it('ignores a set-aside blob that is not readable', async () => {
    window.localStorage.setItem(settingsBackupKey(THIS_VERSION), 'not json');
    window.localStorage.setItem(STORE_KEY, persisted(THIS_VERSION - 1, 42));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await useSettingsStore.persist.rehydrate();

    expect(uiScale()).toBe(42);
    expect(window.localStorage.getItem(settingsBackupKey(THIS_VERSION))).toBeNull();
    warn.mockRestore();
  });
});
