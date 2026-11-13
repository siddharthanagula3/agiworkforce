import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SHORTCUTS,
  describeAccelerator,
  shortcutChoices,
  type GarnishShortcuts,
} from '../garnishCore';

type NativeSurfaceModule = typeof import('../runtime/nativeSurface');
type ShortcutsModule = typeof import('../shortcuts');

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
  Notification: { isSupported: () => true },
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

const shownNotifications: { title: string; body: string }[] = [];

vi.mock('../runtime/nativeSurface', async (importOriginal) => ({
  ...(await importOriginal<NativeSurfaceModule>()),
  createNativeNotification: (options: { title: string; body: string }) => ({
    show: () => {
      shownNotifications.push(options);
    },
  }),
}));

let refusal: string | null = null;
const changeGarnishShortcuts = vi.fn((patch: Partial<GarnishShortcuts>, _handlers: unknown) => {
  if (refusal === null) saveSettings(patch);
  return refusal;
});
let statuses: { key: keyof GarnishShortcuts; accelerator: string; status: string }[] = [];

vi.mock('../shortcuts', async (importOriginal) => ({
  ...(await importOriginal<ShortcutsModule>()),
  changeGarnishShortcuts: (patch: Partial<GarnishShortcuts>, handlers: unknown) =>
    changeGarnishShortcuts(patch, handlers),
  shortcutRegistrations: () => statuses,
  shortcutStatusDetail: (status: string) =>
    status === 'taken' ? 'is already in use by another app' : null,
}));

const { createTray, destroyTray, refreshTrayMenu } = await import('../tray');
type TrayActivity = import('../tray').TrayActivity;

let activity: TrayActivity = {
  runningTurns: [],
  pendingApprovals: [],
  screenTakenOver: false,
  computerUseGranted: false,
};

function makeHandlers() {
  return {
    onOpen: vi.fn(),
    onNewChat: vi.fn(),
    onNewChatWindow: vi.fn(),
    onQuickAsk: vi.fn(),
    onScreenshot: vi.fn(),
    onWindowShot: vi.fn(),
    onVoice: vi.fn(),
    onStopAgents: vi.fn(),
    onStopAll: vi.fn(),
    onHandBackScreen: vi.fn(),
    onRevokeComputerUse: vi.fn(),
    onOpenSession: vi.fn(),
    onCheckForUpdates: vi.fn(),
    onChangeShortcut: vi.fn(),
    activity: () => activity,
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
    changeGarnishShortcuts.mockClear();
    shownNotifications.length = 0;
    refusal = null;
    destroyTray();
  });

  it('hands the chosen accelerator to the shell, which saves it with the settings rollback', () => {
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
    expect(changeGarnishShortcuts).toHaveBeenCalledTimes(1);
    expect(changeGarnishShortcuts).toHaveBeenCalledWith(
      { quickAskShortcut: target },
      {
        onQuickAsk: handlers.onQuickAsk,
        onNewChat: handlers.onNewChatWindow,
        onScreenshot: handlers.onScreenshot,
        onWindowShot: handlers.onWindowShot,
        onVoice: handlers.onVoice,
        onStop: handlers.onStopAgents,
      },
    );
    expect(shownNotifications).toEqual([]);

    const rebuilt = latestMenu();
    expect(itemLabelled(rebuilt, 'Quick Ask').accelerator).toBe(target);
    expect(
      itemLabelled(submenuOf(rebuilt, 'Shortcuts'), describeAccelerator(target, process.platform))
        .checked,
    ).toBe(true);
  });

  it('keeps the Stop Agents choice that was working, and says why, when the new one is refused', () => {
    createTray(makeHandlers());
    const working = stored.stopShortcut;
    const held = shortcutChoices('stopShortcut', working).find((value) => value !== working);
    if (!held) throw new Error('no alternative Stop Agents shortcut is offered');
    refusal = 'Stop Agents could not take that shortcut. The shortcut it had is kept.';

    itemLabelled(
      submenuOf(latestMenu(), 'Shortcuts'),
      describeAccelerator(held, process.platform),
    ).click?.(
      {} as Electron.MenuItem,
      undefined as unknown as Electron.BrowserWindow,
      {} as Electron.KeyboardEvent,
    );

    expect(stored.stopShortcut).toBe(working);
    expect(shownNotifications).toEqual([{ title: 'Shortcut not changed', body: refusal }]);
    expect(
      itemLabelled(
        submenuOf(latestMenu(), 'Shortcuts'),
        describeAccelerator(working, process.platform),
      ).checked,
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

    expect(handlers.onChangeShortcut).toHaveBeenCalledTimes(1);
    expect(handlers.onChangeShortcut).toHaveBeenCalledWith('screenshotShortcut', target);
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

  it('offers the dictation chord and hands a new one to the shell', () => {
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

    expect(handlers.onChangeShortcut).toHaveBeenCalledWith('voiceShortcut', target);
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

describe('tray agent activity', () => {
  const click = (item: Electron.MenuItemConstructorOptions) =>
    item.click?.(
      {} as Electron.MenuItem,
      undefined as unknown as Electron.BrowserWindow,
      {} as Electron.KeyboardEvent,
    );

  beforeEach(() => {
    stored = { ...DEFAULT_SHORTCUTS };
    statuses = [];
    contextMenus.length = 0;
    activity = {
      runningTurns: [],
      pendingApprovals: [],
      screenTakenOver: false,
      computerUseGranted: false,
    };
    destroyTray();
  });

  it('offers no session list and a disabled Stop All while nothing runs', () => {
    createTray(makeHandlers());
    const menu = latestMenu();

    expect(menu.map((entry) => entry.label)).not.toContain('Running');
    expect(itemLabelled(menu, 'Stop All Agents…').enabled).toBe(false);
    expect(menu.map((entry) => entry.label)).not.toContain('Hand Back Screen Control');
    expect(menu.map((entry) => entry.label)).not.toContain('Stop Computer Use and Revoke Access…');
  });

  it('lists approvals and running sessions, each opening its session', () => {
    activity = {
      runningTurns: [{ rootId: 'r1', threadId: 't1', label: 'Coding in agiworkforce' }],
      pendingApprovals: [{ rootId: 'r1', threadId: 't1', label: 'Run pnpm test (agiworkforce)' }],
      screenTakenOver: true,
      computerUseGranted: true,
    };
    const handlers = makeHandlers();
    createTray(handlers);
    const menu = latestMenu();
    const labels = menu.map((entry) => entry.label);

    expect(labels.indexOf('Waiting for Approval')).toBeLessThan(labels.indexOf('Running'));
    click(itemLabelled(menu, 'Run pnpm test (agiworkforce)'));
    expect(handlers.onOpenSession).toHaveBeenCalledWith('r1', 't1');

    const stopAll = itemLabelled(menu, 'Stop All Agents…');
    expect(stopAll.enabled).toBe(true);
    expect(stopAll.accelerator).toBeUndefined();
    click(stopAll);
    expect(handlers.onStopAll).toHaveBeenCalledTimes(1);
    expect(handlers.onStopAgents).not.toHaveBeenCalled();

    click(itemLabelled(menu, 'Hand Back Screen Control'));
    expect(handlers.onHandBackScreen).toHaveBeenCalledTimes(1);

    click(itemLabelled(menu, 'Stop Computer Use and Revoke Access…'));
    expect(handlers.onRevokeComputerUse).toHaveBeenCalledTimes(1);
  });

  it('reflects new activity when the menu is refreshed', () => {
    const handlers = makeHandlers();
    createTray(handlers);
    activity = {
      runningTurns: [{ rootId: 'r1', threadId: 't1', label: 'Coding in agiworkforce' }],
      pendingApprovals: [],
      screenTakenOver: false,
      computerUseGranted: false,
    };
    refreshTrayMenu(handlers);

    expect(latestMenu().map((entry) => entry.label)).toContain('Coding in agiworkforce');
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
