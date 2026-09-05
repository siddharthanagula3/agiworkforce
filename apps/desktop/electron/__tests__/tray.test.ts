import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SHORTCUTS,
  describeAccelerator,
  shortcutChoices,
  type GarnishShortcuts,
} from '../garnishCore';

type MenuTemplate = Electron.MenuItemConstructorOptions[];

const contextMenus: MenuTemplate[] = [];
const trayInstance = {
  setToolTip: vi.fn(),
  setContextMenu: vi.fn((menu: MenuTemplate) => {
    contextMenus.push(menu);
  }),
  on: vi.fn(),
  isDestroyed: () => false,
  destroy: vi.fn(),
};

vi.mock('electron', () => ({
  app: { quit: vi.fn() },
  Menu: { buildFromTemplate: (template: MenuTemplate) => template },
  Tray: function Tray() {
    return trayInstance;
  },
  nativeImage: {
    createFromBuffer: vi.fn(() => {
      throw new Error('no assets in test');
    }),
    createEmpty: vi.fn(() => ({})),
  },
}));

let stored: GarnishShortcuts = { ...DEFAULT_SHORTCUTS };
const saveSettings = vi.fn((patch: Partial<GarnishShortcuts>) => {
  stored = { ...stored, ...patch };
  return stored;
});

vi.mock('../settingsStore', () => ({
  getShortcuts: () => stored,
  saveSettings: (patch: Partial<GarnishShortcuts>) => saveSettings(patch),
}));

const registerGarnishShortcuts = vi.fn();
const unregisterGarnishShortcuts = vi.fn();
let statuses: { key: keyof GarnishShortcuts; accelerator: string; status: string }[] = [];

vi.mock('../shortcuts', () => ({
  registerGarnishShortcuts: (handlers: unknown) => registerGarnishShortcuts(handlers),
  unregisterGarnishShortcuts: () => unregisterGarnishShortcuts(),
  shortcutRegistrations: () => statuses,
  shortcutStatusDetail: (status: string) =>
    status === 'taken' ? 'is already in use by another app' : null,
}));

const { createTray, destroyTray } = await import('../tray');

function makeHandlers() {
  return {
    onOpen: vi.fn(),
    onNewChat: vi.fn(),
    onQuickAsk: vi.fn(),
    onScreenshot: vi.fn(),
    onVoice: vi.fn(),
    onCheckForUpdates: vi.fn(),
  };
}

function latestMenu(): MenuTemplate {
  const menu = contextMenus.at(-1);
  if (!menu) throw new Error('tray menu was never set');
  return menu;
}

function submenuOf(menu: MenuTemplate, label: string): MenuTemplate {
  const item = menu.find((entry) => entry.label === label);
  if (!item?.submenu) throw new Error(`no "${label}" submenu in the tray menu`);
  return item.submenu as MenuTemplate;
}

function itemLabelled(menu: MenuTemplate, label: string): Electron.MenuItemConstructorOptions {
  const item = menu.find((entry) => entry.label === label);
  if (!item) throw new Error(`no "${label}" item in the menu`);
  return item;
}

describe('tray shortcut customization', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stored = { ...DEFAULT_SHORTCUTS };
    statuses = [];
    contextMenus.length = 0;
    saveSettings.mockClear();
    registerGarnishShortcuts.mockClear();
    unregisterGarnishShortcuts.mockClear();
    destroyTray();
  });

  it('persists the chosen accelerator, re-registers it, and rebuilds the tray menu', () => {
    const handlers = makeHandlers();
    createTray(handlers);

    const choices = submenuOf(latestMenu(), 'Shortcuts');
    const target = 'CommandOrControl+Alt+A';
    const choice = itemLabelled(choices, describeAccelerator(target, process.platform));
    expect(choice.type).toBe('radio');
    expect(choice.checked).toBe(false);

    choice.click?.(
      {} as Electron.MenuItem,
      undefined as unknown as Electron.BrowserWindow,
      {} as Electron.KeyboardEvent,
    );

    expect(saveSettings).toHaveBeenCalledWith({ quickAskShortcut: target });
    expect(stored.quickAskShortcut).toBe(target);
    expect(unregisterGarnishShortcuts).toHaveBeenCalledTimes(1);
    expect(registerGarnishShortcuts).toHaveBeenCalledWith({
      onQuickAsk: handlers.onQuickAsk,
      onScreenshot: handlers.onScreenshot,
      onVoice: handlers.onVoice,
    });

    expect(contextMenus).toHaveLength(2);
    const rebuilt = latestMenu();
    expect(itemLabelled(rebuilt, 'Quick Ask').accelerator).toBe(target);
    expect(
      itemLabelled(submenuOf(rebuilt, 'Shortcuts'), describeAccelerator(target, process.platform))
        .checked,
    ).toBe(true);
  });

  it('leaves the other shortcut untouched when one is changed', () => {
    createTray(makeHandlers());

    const target = 'CommandOrControl+Alt+S';
    itemLabelled(
      submenuOf(latestMenu(), 'Shortcuts'),
      describeAccelerator(target, process.platform),
    ).click?.(
      {} as Electron.MenuItem,
      undefined as unknown as Electron.BrowserWindow,
      {} as Electron.KeyboardEvent,
    );

    expect(saveSettings).toHaveBeenCalledWith({ screenshotShortcut: target });
    expect(stored.quickAskShortcut).toBe(DEFAULT_SHORTCUTS.quickAskShortcut);
  });

  it('offers a hand-edited accelerator alongside the presets so the menu shows the truth', () => {
    stored = { ...DEFAULT_SHORTCUTS, quickAskShortcut: 'CommandOrControl+Shift+9' };
    createTray(makeHandlers());

    const choices = submenuOf(latestMenu(), 'Shortcuts');
    const custom = itemLabelled(
      choices,
      describeAccelerator('CommandOrControl+Shift+9', process.platform),
    );
    expect(custom.checked).toBe(true);
  });
});

describe('tray dictation shortcut', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stored = { ...DEFAULT_SHORTCUTS };
    statuses = [];
    contextMenus.length = 0;
    destroyTray();
  });

  it('offers the dictation chord and re-registers when it changes', () => {
    const handlers = makeHandlers();
    createTray(handlers);

    const target = 'CommandOrControl+Alt+D';
    itemLabelled(
      submenuOf(latestMenu(), 'Shortcuts'),
      describeAccelerator(target, process.platform),
    ).click?.(
      {} as Electron.MenuItem,
      undefined as unknown as Electron.BrowserWindow,
      {} as Electron.KeyboardEvent,
    );

    expect(saveSettings).toHaveBeenCalledWith({ voiceShortcut: target });
    expect(itemLabelled(latestMenu(), 'Dictation').accelerator).toBe(target);
  });

  it('names the reason a chord could not be claimed in its heading', () => {
    statuses = [
      {
        key: 'voiceShortcut',
        accelerator: DEFAULT_SHORTCUTS.voiceShortcut,
        status: 'taken',
      },
    ];
    createTray(makeHandlers());

    const headings = submenuOf(latestMenu(), 'Shortcuts')
      .map((entry) => entry.label)
      .filter((label): label is string => typeof label === 'string');
    expect(headings).toContain('Dictation (is already in use by another app)');
  });
});

describe('shortcutChoices', () => {
  it('keeps the preset list when the current value is already a preset', () => {
    expect(shortcutChoices('quickAskShortcut', DEFAULT_SHORTCUTS.quickAskShortcut)).toEqual([
      DEFAULT_SHORTCUTS.quickAskShortcut,
      'CommandOrControl+Shift+Space',
      'CommandOrControl+Alt+A',
    ]);
  });

  it('never surfaces an unusable accelerator as a choice', () => {
    expect(shortcutChoices('quickAskShortcut', 'Alt + Space')).not.toContain('Alt + Space');
  });
});

describe('describeAccelerator', () => {
  it('renders mac modifier symbols', () => {
    expect(describeAccelerator('CommandOrControl+Shift+2', 'darwin')).toBe('⌘⇧2');
    expect(describeAccelerator('Alt+Shift+Space', 'darwin')).toBe('⌥⇧Space');
  });

  it('renders Ctrl on other platforms', () => {
    expect(describeAccelerator('CommandOrControl+Shift+2', 'win32')).toBe('Ctrl+Shift+2');
  });
});
