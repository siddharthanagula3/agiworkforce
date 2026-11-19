import { describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { HOST_COMMANDS, HOST_MENU_SHORTCUTS } from '@agiworkforce/local-runtime-contract';
import { COMPANY_SITE_NAME, PRODUCT_NAMES } from '@agiworkforce/types';

vi.mock('electron', () => ({
  Menu: { buildFromTemplate: vi.fn((template: unknown) => template), setApplicationMenu: vi.fn() },
  app: { name: 'AGI Desktop', isPackaged: true },
}));
const launchAtLogin = vi.hoisted(() => ({ setLaunchAtLogin: vi.fn() }));
vi.mock('../launchAtLogin', () => ({
  isLaunchAtLoginEnabled: () => false,
  setLaunchAtLogin: launchAtLogin.setLaunchAtLogin,
}));

type MenuPlatform = 'darwin' | 'linux' | 'win32';
const MENU_PLATFORMS: MenuPlatform[] = ['darwin', 'linux', 'win32'];

// The menu reads the platform once, when appMenu is imported, so each platform
// gets its own import with process.platform forced for that moment only.
async function loadMenuFor(platform: MenuPlatform) {
  const host = Object.getOwnPropertyDescriptor(process, 'platform');
  vi.resetModules();
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  try {
    return await import('../appMenu');
  } finally {
    if (host) Object.defineProperty(process, 'platform', host);
  }
}

const menuModules = {
  darwin: await loadMenuFor('darwin'),
  linux: await loadMenuFor('linux'),
  win32: await loadMenuFor('win32'),
};
const { dockMenuTemplate } = menuModules.darwin;

const hostMenuPlatform: MenuPlatform =
  process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';

const { appMenuTemplate } = menuModules[hostMenuPlatform];

function platformPlaces(platform: MenuPlatform) {
  const isMac = platform === 'darwin';
  return {
    settingsMenu: isMac ? 'AGI Desktop' : 'File',
    settingsLabel: isMac ? 'Settings…' : 'Settings',
    updatesMenu: isMac ? 'AGI Desktop' : 'Help',
    updatesLabel: isMac ? 'Check for Updates…' : 'Check for Updates',
  };
}

const {
  settingsMenu: SETTINGS_MENU,
  settingsLabel: SETTINGS_LABEL,
  updatesMenu: UPDATES_MENU,
  updatesLabel: UPDATES_LABEL,
} = platformPlaces(hostMenuPlatform);

function actions() {
  return {
    newChat: vi.fn(),
    newWindow: vi.fn(),
    openCurrentChatInNewWindow: vi.fn(),
    copyConversationUrl: vi.fn(),
    openConversationInNewWindow: vi.fn(),
    hasFocusedConversation: vi.fn(() => true),
    isFrontWindowOnTop: vi.fn(() => false),
    setFrontWindowOnTop: vi.fn(),
    toggleQuickAsk: vi.fn(),
    captureScreenshot: vi.fn(),
    openSettings: vi.fn(),
    openLogs: vi.fn(),
    copyDiagnostics: vi.fn(),
    clearCacheAndRestart: vi.fn(),
    openProductHelp: vi.fn(),
    openWhatsNew: vi.fn(),
    openSupport: vi.fn(),
    openOpenSourceNotices: vi.fn(),
    checkForUpdates: vi.fn(),
    sendHostCommand: vi.fn(),
    terminalAvailable: vi.fn(() => false),
    terminalOpen: vi.fn(() => false),
    sideChatAvailable: vi.fn(() => false),
    sideChatOpen: vi.fn(() => false),
    goBack: vi.fn(),
    goForward: vi.fn(),
    setZoomLevel: vi.fn(),
    stepZoomLevel: vi.fn(),
    takeOverScreen: vi.fn(),
    handBackScreen: vi.fn(),
    stopScreenControl: vi.fn(),
    closeAllWindows: vi.fn(),
    minimizeAllWindows: vi.fn(),
    zoomAllWindows: vi.fn(),
    fillWindow: vi.fn(),
    centerWindow: vi.fn(),
    moveWindow: vi.fn(),
    hasPreviousWindowSize: vi.fn(() => false),
    returnToPreviousSize: vi.fn(),
    arrangeWindows: vi.fn(),
    arrangeInFront: vi.fn(),
    frontWindowIsInSet: vi.fn(() => false),
    removeWindowFromSet: vi.fn(),
    shellWindows: vi.fn(() => []),
    focusShellWindow: vi.fn(),
  };
}

const ACCELERATORS = { quickAsk: 'Alt+Shift+Space', screenshot: 'CommandOrControl+Shift+2' };

function contractAccelerator(id: string): string {
  const shortcut = HOST_MENU_SHORTCUTS.find((candidate) => candidate.id === id);
  if (!shortcut) throw new Error(`the contract has no ${id}`);
  return shortcut.accelerator;
}

function template(overrides = actions(), platform: MenuPlatform = hostMenuPlatform) {
  return {
    menu: menuModules[platform].appMenuTemplate(overrides, ACCELERATORS),
    actions: overrides,
  };
}

function submenu(menu: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions[] {
  const found = menu.find((entry) => entry.label === label || entry.role === label.toLowerCase());
  return (found?.submenu as MenuItemConstructorOptions[] | undefined) ?? [];
}

function item(
  menu: MenuItemConstructorOptions[],
  menuLabel: string,
  itemLabel: string,
): MenuItemConstructorOptions {
  const found = submenu(menu, menuLabel).find((entry) => entry.label === itemLabel);
  if (!found) throw new Error(`${menuLabel} has no item labelled ${itemLabel}`);
  return found;
}

function editFindItem(
  menu: MenuItemConstructorOptions[],
  label: string,
): MenuItemConstructorOptions {
  const find = submenu(menu, 'Edit').find((entry) => entry.label === 'Find');
  const found = ((find?.submenu as MenuItemConstructorOptions[] | undefined) ?? []).find(
    (entry) => entry.label === label,
  );
  if (!found) throw new Error(`Find has no item labelled ${label}`);
  return found;
}

describe('the application menu', () => {
  it('carries the menus a desktop app is expected to have', () => {
    const { menu } = template();
    const labels = menu.map((entry) => entry.label ?? entry.role);

    expect(labels).toEqual(expect.arrayContaining(['File', 'Edit', 'View', 'History', 'Window']));
    expect(menu.some((entry) => entry.role === 'help')).toBe(true);
  });

  it('shows the configured Quick Ask and Screenshot chords without claiming them', () => {
    const { menu } = template();

    for (const [label, accelerator] of [
      ['Quick Ask', ACCELERATORS.quickAsk],
      ['Screenshot to Chat', ACCELERATORS.screenshot],
    ] as const) {
      const entry = item(menu, 'File', label);
      expect(entry.accelerator, label).toBe(accelerator);
      // A global shortcut already owns this chord; registering it here too
      // would fire the action twice or take it away from the global one.
      expect(entry.registerAccelerator, label).toBe(false);
    }
  });

  it('shows the page bindings for the two actions the page owns, without claiming them', () => {
    const { menu } = template();
    const toggle = item(menu, 'View', 'Toggle Sidebar');
    const shortcuts = submenu(menu, 'Help').find((entry) => entry.label === 'Keyboard Shortcuts');

    expect(toggle.accelerator).toBe('CommandOrControl+B');
    expect(toggle.registerAccelerator).toBe(false);
    expect(shortcuts?.accelerator).toBe('CommandOrControl+/');
    expect(shortcuts?.registerAccelerator).toBe(false);
  });

  it('sends each page-owned item as a command the contract names', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Toggle Sidebar').click as () => void)();
    (item(menu, 'View', 'Search').click as () => void)();
    (
      submenu(menu, 'Help').find((entry) => entry.label === 'Keyboard Shortcuts')
        ?.click as () => void
    )();

    const sent = spies.sendHostCommand.mock.calls.map(([command]) => command);
    expect(sent).toEqual(['toggle-sidebar', 'open-search', 'show-keyboard-shortcuts']);
    expect(item(menu, 'View', 'Search').registerAccelerator).toBe(false);
    for (const command of sent) {
      expect(HOST_COMMANDS).toContain(command);
    }
  });

  it('opens keyboard shortcuts from the public window Help menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'Help', 'Keyboard Shortcuts').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('show-keyboard-shortcuts');
  });

  it('shows a side chat from the public window View menu when a conversation is open', () => {
    const idle = template();
    const hidden = item(idle.menu, 'View', 'Show Side Chat');
    expect(hidden.enabled).toBe(false);

    const spies = actions();
    spies.sideChatAvailable.mockReturnValue(true);
    const shown = template(spies);
    const open = item(shown.menu, 'View', 'Show Side Chat');
    expect(open.enabled).toBe(true);
    expect(open.accelerator).toBe('CommandOrControl+;');
    (open.click as () => void)();
    expect(spies.sendHostCommand).toHaveBeenCalledWith('toggle-side-chat');

    spies.sideChatOpen.mockReturnValue(true);
    spies.sendHostCommand.mockClear();
    const hiding = template(spies);
    const close = item(hiding.menu, 'View', 'Hide Side Chat');
    expect(close.enabled).toBe(true);
    (close.click as () => void)();
    expect(spies.sendHostCommand).toHaveBeenCalledWith('toggle-side-chat');
  });

  it('shows the terminal from the public window View menu when a pane is open', () => {
    const idle = template();
    const hidden = item(idle.menu, 'View', 'Show Terminal');
    expect(hidden.enabled).toBe(false);
    expect(hidden.registerAccelerator).toBe(false);

    const spies = actions();
    spies.terminalAvailable.mockReturnValue(true);
    const shown = template(spies);
    const open = item(shown.menu, 'View', 'Show Terminal');
    expect(open.enabled).toBe(true);
    (open.click as () => void)();
    expect(spies.sendHostCommand).toHaveBeenCalledWith('toggle-terminal');

    spies.terminalOpen.mockReturnValue(true);
    spies.sendHostCommand.mockClear();
    const hiding = template(spies);
    const close = item(hiding.menu, 'View', 'Hide Terminal');
    expect(close.enabled).toBe(true);
    (close.click as () => void)();
    expect(spies.sendHostCommand).toHaveBeenCalledWith('toggle-terminal');
  });

  it('opens feedback from the public window Help menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'Help', 'Send Feedback').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('send-feedback');
  });

  it('drives zoom by steps and resets to actual size', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Zoom In').click as () => void)();
    (item(menu, 'View', 'Zoom Out').click as () => void)();
    (item(menu, 'View', 'Actual Size').click as () => void)();

    expect(spies.stepZoomLevel.mock.calls).toEqual([[1], [-1]]);
    expect(spies.setZoomLevel).toHaveBeenCalledWith(0);
  });

  it('opens the previous tab from the public window View menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Previous Tab').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('previous-tab');
  });

  it('opens the next tab from the public window View menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Next Tab').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('next-tab');
  });

  it('starts a performance trace from the public window Help menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'Help', 'Start Performance Trace').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('start-performance-trace');
  });

  it('reopens the last closed tab from the public window View menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Reopen Closed Tab').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('reopen-closed-tab');
  });

  it('opens the first tab from the public window View menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'First Tab').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('focus-first-tab');
  });

  it('closes the active tab from the public window View menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Close Tab').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('close-active-tab');
  });

  it('closes the other tabs from the public window View menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Close Other Tabs').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('close-other-tabs');
  });

  it('closes the tabs to the right from the public window View menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Close Tabs to the Right').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('close-tabs-to-the-right');
  });

  it('opens the second tab from the public window View menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Second Tab').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('focus-second-tab');
  });

  it('opens the third tab from the public window View menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Third Tab').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('focus-third-tab');
  });

  it('opens the fourth tab from the public window View menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Fourth Tab').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('focus-fourth-tab');
  });

  it('opens the fifth tab from the public window View menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Fifth Tab').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('focus-fifth-tab');
  });

  it('opens the sixth tab from the public window View menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Sixth Tab').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('focus-sixth-tab');
  });

  it('opens the seventh tab from the public window View menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Seventh Tab').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('focus-seventh-tab');
  });

  it('opens the eighth tab from the public window View menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Eighth Tab').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('focus-eighth-tab');
  });

  it('shows the changes panel from the public window View menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Show Changes').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('toggle-changes');
  });

  it('focuses the composer from the public window Edit menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'Edit', 'Focus Follow-up').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('focus-follow-up');
  });

  it('shows the file tree from the public window View menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Show Files').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('toggle-files');
  });

  it('shows the open chats from the public window View menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'Show Tabs').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('toggle-chat-tabs');
  });

  it('opens a new tab from the public window View menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'View', 'New Tab').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('new-tab');
  });

  it('opens the previous chat from the public window History menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'History', 'Previous Chat').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('previous-chat');
  });

  it('opens the next chat from the public window History menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'History', 'Next Chat').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('next-chat');
  });

  it('moves through history from the History menu', () => {
    const { menu, actions: spies } = template();

    expect(item(menu, 'History', 'Back').accelerator).toBe(contractAccelerator('host-back'));
    expect(item(menu, 'History', 'Forward').accelerator).toBe(contractAccelerator('host-forward'));

    (item(menu, 'History', 'Back').click as () => void)();
    (item(menu, 'History', 'Forward').click as () => void)();

    expect(spies.goBack).toHaveBeenCalledTimes(1);
    expect(spies.goForward).toHaveBeenCalledTimes(1);
  });

  it('keeps the help items wired to something', () => {
    const { menu, actions: spies } = template();
    const help = submenu(menu, 'Help');

    for (const label of [`${PRODUCT_NAMES.desktop} Support`, 'Open-Source Licenses']) {
      const entry = help.find((candidate) => candidate.label === label);
      expect(entry, label).toBeDefined();
      (entry?.click as () => void)();
    }
    const trouble = help.find((candidate) => candidate.label === 'Troubleshooting');
    const logs = (trouble?.submenu as MenuItemConstructorOptions[] | undefined)?.find(
      (candidate) => candidate.label === 'Open Logs',
    );
    expect(logs).toBeDefined();
    (logs?.click as () => void)();
    (item(menu, UPDATES_MENU, UPDATES_LABEL).click as () => void)();

    expect(spies.openSupport).toHaveBeenCalledTimes(1);
    expect(spies.openLogs).toHaveBeenCalledTimes(1);
    expect(spies.openOpenSourceNotices).toHaveBeenCalledTimes(1);
    expect(spies.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('opens product help from the public window Help menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'Help', `${PRODUCT_NAMES.desktop} Help`).click as () => void)();

    expect(spies.openProductHelp).toHaveBeenCalledTimes(1);
  });

  it("opens What's New from the public window Help menu", () => {
    const { menu, actions: spies } = template();

    (item(menu, 'Help', "What's New").click as () => void)();

    expect(spies.openWhatsNew).toHaveBeenCalledTimes(1);
  });

  it('names the support item for the product, never the company', () => {
    const labels = submenu(template().menu, 'Help').map((entry) => entry.label);

    expect(labels).toContain(`${PRODUCT_NAMES.desktop} Support`);
    expect(labels).not.toContain(`${COMPANY_SITE_NAME} Support`);
  });

  it('keeps Reload in a packaged build and the developer tools out of it', () => {
    const view = submenu(template().menu, 'View');

    expect(view.some((entry) => entry.role === 'reload')).toBe(true);
    expect(view.some((entry) => entry.role === 'toggleDevTools')).toBe(false);
  });

  it('leaves no item without an action', () => {
    const { menu } = template();

    const assertActions = (items: MenuItemConstructorOptions[], trail: string) => {
      for (const child of items) {
        if (child.type === 'separator' || child.role) continue;
        if (child.enabled === false && typeof child.click !== 'function') continue;
        const label = `${trail} > ${child.label}`;
        if (Array.isArray(child.submenu)) {
          assertActions(child.submenu, label);
          continue;
        }
        expect(typeof child.click, label).toBe('function');
      }
    };

    for (const entry of menu) {
      assertActions(
        (entry.submenu as MenuItemConstructorOptions[] | undefined) ?? [],
        entry.label ?? String(entry.role),
      );
    }
  });

  it('takes every chord it claims from the contract the shortcut sheet renders', () => {
    const { menu } = template();
    const claimed: Array<[string, string, string]> = [
      ['File', 'New Chat', 'host-new-chat'],
      ['Window', 'New Window', 'host-new-window'],
      [SETTINGS_MENU, SETTINGS_LABEL, 'host-settings'],
      ['View', 'Actual Size', 'host-actual-size'],
      ['View', 'Zoom In', 'host-zoom-in'],
      ['View', 'Zoom Out', 'host-zoom-out'],
      ['History', 'Back', 'host-back'],
      ['History', 'Forward', 'host-forward'],
      ['History', 'Previous Chat', 'host-previous-chat'],
      ['History', 'Next Chat', 'host-next-chat'],
      ['View', 'New Tab', 'host-new-tab'],
      ['View', 'Previous Tab', 'host-previous-tab'],
      ['View', 'Next Tab', 'host-next-tab'],
    ];

    for (const [menuLabel, itemLabel, id] of claimed) {
      expect(item(menu, menuLabel, itemLabel).accelerator).toBe(contractAccelerator(id));
    }
  });

  it('lets the user take the screen back from the agent and hand it back', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'File', 'Take Over Screen Control').click as () => void)();
    (item(menu, 'File', 'Hand Back Screen Control').click as () => void)();

    expect(spies.takeOverScreen).toHaveBeenCalledTimes(1);
    expect(spies.handBackScreen).toHaveBeenCalledTimes(1);
  });

  it('closes a window from the File menu on every platform', () => {
    const { menu } = template();
    const fileItems = submenu(menu, 'File');
    const close = fileItems.find((entry) => entry.role === 'close');

    expect(close).toBeDefined();
    expect(close?.accelerator).toBe(contractAccelerator('host-close-window'));
  });

  it('pastes and matches style from the public window Edit menu on macOS', () => {
    const { menu } = template(actions(), 'darwin');
    const edit = submenu(menu, 'Edit');

    expect(edit.some((entry) => entry.role === 'pasteAndMatchStyle')).toBe(true);
  });

  it('deletes from the public window Edit menu on macOS', () => {
    const { menu } = template(actions(), 'darwin');
    const edit = submenu(menu, 'Edit');

    expect(edit.some((entry) => entry.role === 'delete')).toBe(true);
  });

  it('selects all from the public window Edit menu', () => {
    const { menu } = template();
    const edit = submenu(menu, 'Edit');

    expect(edit.some((entry) => entry.role === 'selectAll')).toBe(true);
  });

  it('undoes from the public window Edit menu', () => {
    const { menu } = template();
    const edit = submenu(menu, 'Edit');

    expect(edit.some((entry) => entry.role === 'undo')).toBe(true);
  });

  it('redoes from the public window Edit menu', () => {
    const { menu } = template();
    const edit = submenu(menu, 'Edit');

    expect(edit.some((entry) => entry.role === 'redo')).toBe(true);
  });

  it('cuts from the public window Edit menu', () => {
    const { menu } = template();
    const edit = submenu(menu, 'Edit');

    expect(edit.some((entry) => entry.role === 'cut')).toBe(true);
  });

  it('copies from the public window Edit menu', () => {
    const { menu } = template();
    const edit = submenu(menu, 'Edit');

    expect(edit.some((entry) => entry.role === 'copy')).toBe(true);
  });

  it('opens About from the public window application menu on macOS', () => {
    const { menu } = template(actions(), 'darwin');
    const application = submenu(menu, 'AGI Desktop');

    expect(application.some((entry) => entry.role === 'about')).toBe(true);
  });

  it('opens Services from the public window application menu on macOS', () => {
    const { menu } = template(actions(), 'darwin');
    const application = submenu(menu, 'AGI Desktop');

    expect(application.some((entry) => entry.role === 'services')).toBe(true);
  });

  it('puts Hide on the public window application menu on macOS', () => {
    const { menu } = template(actions(), 'darwin');
    const application = submenu(menu, 'AGI Desktop');

    expect(application.some((entry) => entry.role === 'hide')).toBe(true);
  });

  it('puts Hide Others on the public window application menu on macOS', () => {
    const { menu } = template(actions(), 'darwin');
    const application = submenu(menu, 'AGI Desktop');

    expect(application.some((entry) => entry.role === 'hideOthers')).toBe(true);
  });

  it('puts Show All on the public window application menu on macOS', () => {
    const { menu } = template(actions(), 'darwin');
    const application = submenu(menu, 'AGI Desktop');

    expect(application.some((entry) => entry.role === 'unhide')).toBe(true);
  });

  it('puts Quit on the public window application menu on macOS', () => {
    const { menu } = template(actions(), 'darwin');
    const application = submenu(menu, 'AGI Desktop');

    expect(application.some((entry) => entry.role === 'quit')).toBe(true);
  });

  it('pastes from the public window Edit menu', () => {
    const { menu } = template();
    const edit = submenu(menu, 'Edit');

    expect(edit.some((entry) => entry.role === 'paste')).toBe(true);
  });

  it('closes every window from File > Close All on the public window', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'File', 'Close All').click as () => void)();

    expect(spies.closeAllWindows).toHaveBeenCalledTimes(1);
  });

  it('hands full screen, minimize and zoom to the platform rather than reimplementing them', () => {
    const { menu } = template();
    const view = submenu(menu, 'View').map((entry) => entry.role);
    const windowItems = submenu(menu, 'Window').map((entry) => entry.role);

    expect(view).toContain('togglefullscreen');
    expect(windowItems).toContain('minimize');
    expect(windowItems).toContain('zoom');
  });

  it('puts Minimize on the public window Window menu', () => {
    const { menu } = template();
    const windowItems = submenu(menu, 'Window');

    expect(windowItems.some((entry) => entry.role === 'minimize')).toBe(true);
  });

  it('puts Minimize All on the public window Window menu on macOS', () => {
    const { menu, actions: spies } = template(actions(), 'darwin');
    const entry = item(menu, 'Window', 'Minimize All');

    (entry.click as () => void)();

    expect(spies.minimizeAllWindows).toHaveBeenCalledTimes(1);
  });

  it('puts Zoom on the public window Window menu', () => {
    const { menu } = template();
    const windowItems = submenu(menu, 'Window');

    expect(windowItems.some((entry) => entry.role === 'zoom')).toBe(true);
  });

  it('fills the front window from the public Window menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'Window', 'Fill').click as () => void)();

    expect(spies.fillWindow).toHaveBeenCalledTimes(1);
  });

  it('centers the front window from the public Window menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'Window', 'Center').click as () => void)();

    expect(spies.centerWindow).toHaveBeenCalledTimes(1);
  });

  it('returns the front window to its previous size from Move & Resize', () => {
    const idle = actions();
    const idleMenu = template(idle).menu;
    const idleMove = submenu(idleMenu, 'Window').find((entry) => entry.label === 'Move & Resize');
    const idleItem = ((idleMove?.submenu as MenuItemConstructorOptions[] | undefined) ?? []).find(
      (entry) => entry.label === 'Return to Previous Size',
    );

    expect(idleItem?.enabled).toBe(false);

    const spies = actions();
    spies.hasPreviousWindowSize.mockReturnValue(true);
    const { menu } = template(spies);
    const move = submenu(menu, 'Window').find((entry) => entry.label === 'Move & Resize');
    const restore = ((move?.submenu as MenuItemConstructorOptions[] | undefined) ?? []).find(
      (entry) => entry.label === 'Return to Previous Size',
    );

    expect(restore?.enabled).toBe(true);
    (restore?.click as () => void)();

    expect(spies.returnToPreviousSize).toHaveBeenCalledTimes(1);
  });

  it('moves the front window from the public Window menu', () => {
    const { menu, actions: spies } = template();
    const move = submenu(menu, 'Window').find((entry) => entry.label === 'Move & Resize');
    const tiles = (move?.submenu ?? []) as MenuItemConstructorOptions[];
    const left = tiles.find((entry) => entry.label === 'Left');

    (left?.click as () => void)();

    expect(spies.moveWindow).toHaveBeenCalledWith('left');
  });

  it('arranges windows from the public Window menu', () => {
    const { menu, actions: spies } = template();
    const move = submenu(menu, 'Window').find((entry) => entry.label === 'Move & Resize');
    const tiles = (move?.submenu ?? []) as MenuItemConstructorOptions[];
    const pair = tiles.find((entry) => entry.label === 'Left & Right');

    (pair?.click as () => void)();

    expect(spies.arrangeWindows).toHaveBeenCalledWith('left-right');
  });

  it('places windows in quarters from the public Window menu', () => {
    const { menu, actions: spies } = template();
    const move = submenu(menu, 'Window').find((entry) => entry.label === 'Move & Resize');
    const tiles = (move?.submenu ?? []) as MenuItemConstructorOptions[];
    const quarters = tiles.find((entry) => entry.label === 'Quarters' && entry.enabled !== false);

    (quarters?.click as () => void)();

    expect(spies.arrangeWindows).toHaveBeenCalledWith('quarters');
  });

  it('shows the Move & Resize section labels on the public Window menu', () => {
    const { menu } = template();
    const move = submenu(menu, 'Window').find((entry) => entry.label === 'Move & Resize');
    const tiles = (move?.submenu ?? []) as MenuItemConstructorOptions[];
    const disabled = (label: string) =>
      tiles.filter((entry) => entry.label === label && entry.enabled === false);

    expect(disabled('Halves')).toHaveLength(1);
    expect(disabled('Quarters')).toHaveLength(1);
    expect(disabled('Arrange')).toHaveLength(1);
    expect(tiles.some((entry) => entry.label === 'Quarters' && entry.enabled !== false)).toBe(true);
  });

  it('places the front window on every other Move & Resize tile', () => {
    const { menu, actions: spies } = template();
    const move = submenu(menu, 'Window').find((entry) => entry.label === 'Move & Resize');
    const tiles = (move?.submenu ?? []) as MenuItemConstructorOptions[];
    const tileMenu = submenu(menu, 'Window').find((entry) => entry.label === 'Full Screen Tile');
    const sides = (tileMenu?.submenu ?? []) as MenuItemConstructorOptions[];
    const click = (entries: MenuItemConstructorOptions[], label: string) => {
      const entry = entries.find((candidate) => candidate.label === label);
      expect(entry, label).toBeDefined();
      (entry?.click as () => void)();
    };

    for (const label of [
      'Right',
      'Top',
      'Bottom',
      'Top Left',
      'Top Right',
      'Bottom Left',
      'Bottom Right',
    ]) {
      click(tiles, label);
    }
    click(sides, 'Right of Screen');
    for (const label of [
      'Left & Quarters',
      'Right & Left',
      'Right & Quarters',
      'Top & Bottom',
      'Top & Quarters',
      'Bottom & Top',
      'Bottom & Quarters',
    ]) {
      click(tiles, label);
    }

    expect(spies.moveWindow.mock.calls.map(([tile]) => tile)).toEqual([
      'right',
      'top',
      'bottom',
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
      'right',
    ]);
    expect(spies.arrangeWindows.mock.calls.map(([arrangement]) => arrangement)).toEqual([
      'left-quarters',
      'right-left',
      'right-quarters',
      'top-bottom',
      'top-quarters',
      'bottom-top',
      'bottom-quarters',
    ]);
  });

  it('puts Bring All to Front on the public window Window menu on macOS', () => {
    const { menu } = template(actions(), 'darwin');
    const windowItems = submenu(menu, 'Window');

    expect(windowItems.some((entry) => entry.role === 'front')).toBe(true);
  });

  it('arranges windows in front from the public Window menu on macOS', () => {
    const { menu, actions: spies } = template(actions(), 'darwin');

    (item(menu, 'Window', 'Arrange in Front').click as () => void)();

    expect(spies.arrangeInFront).toHaveBeenCalledTimes(1);
  });

  it('removes the front window from its set on the public Window menu on macOS', () => {
    const spies = actions();
    spies.frontWindowIsInSet.mockReturnValue(true);
    const { menu } = template(spies, 'darwin');
    const entry = item(menu, 'Window', 'Remove Window from Set');

    expect(entry.enabled).toBe(true);
    (entry.click as () => void)();

    expect(spies.removeWindowFromSet).toHaveBeenCalledTimes(1);
  });

  it('lists the open windows on the public Window menu and focuses the one that was chosen on macOS', () => {
    const spies = actions();
    spies.shellWindows.mockReturnValue([
      { id: 4, title: 'AGI Desktop', focused: true },
      { id: 9, title: 'AGI Desktop', focused: false },
    ]);
    const { menu } = template(spies, 'darwin');
    const entries = submenu(menu, 'Window').filter((entry) => entry.label === 'AGI Desktop');

    expect(entries).toHaveLength(2);
    expect(entries[0]?.checked).toBe(true);
    expect(entries[1]?.checked).toBe(false);
    (entries[1]?.click as () => void)();

    expect(spies.focusShellWindow).toHaveBeenCalledWith(9);
  });

  it('leaves Remove Window from Set disabled until the front window is in a set on macOS', () => {
    const { menu } = template(actions(), 'darwin');

    expect(item(menu, 'Window', 'Remove Window from Set').enabled).toBe(false);
  });

  it('tiles the front window from the public Window menu', () => {
    const { menu, actions: spies } = template();
    const tile = submenu(menu, 'Window').find((entry) => entry.label === 'Full Screen Tile');
    const sides = (tile?.submenu ?? []) as MenuItemConstructorOptions[];
    const left = sides.find((entry) => entry.label === 'Left of Screen');

    (left?.click as () => void)();

    expect(spies.moveWindow).toHaveBeenCalledWith('left');
  });

  it('puts Zoom All on the public window Window menu on macOS', () => {
    const { menu, actions: spies } = template(actions(), 'darwin');
    const entry = item(menu, 'Window', 'Zoom All');

    (entry.click as () => void)();

    expect(spies.zoomAllWindows).toHaveBeenCalledTimes(1);
  });

  it('puts Enter Full Screen on the public window View menu', () => {
    const { menu } = template();
    const view = submenu(menu, 'View');

    expect(view.some((entry) => entry.role === 'togglefullscreen')).toBe(true);
  });

  it('puts a support report on the clipboard from the Help menu', () => {
    const { menu, actions: spies } = template();
    const trouble = submenu(menu, 'Help').find((entry) => entry.label === 'Troubleshooting');
    const report = (trouble?.submenu as MenuItemConstructorOptions[] | undefined)?.find(
      (entry) => entry.label === 'Copy Diagnostics',
    );

    (report?.click as () => void)();

    expect(spies.copyDiagnostics).toHaveBeenCalledTimes(1);
  });

  it('opens logs from Help > Troubleshooting on the public window', () => {
    const { menu, actions: spies } = template();
    const trouble = submenu(menu, 'Help').find((entry) => entry.label === 'Troubleshooting');
    const logs = (trouble?.submenu as MenuItemConstructorOptions[] | undefined)?.find(
      (entry) => entry.label === 'Open Logs',
    );

    (logs?.click as () => void)();

    expect(spies.openLogs).toHaveBeenCalledTimes(1);
  });

  it('clears the cache and restarts from Help > Troubleshooting', () => {
    const { menu, actions: spies } = template();
    const trouble = submenu(menu, 'Help').find((entry) => entry.label === 'Troubleshooting');
    const clear = (trouble?.submenu as MenuItemConstructorOptions[] | undefined)?.find(
      (entry) => entry.label === 'Clear Cache and Restart…',
    );

    (clear?.click as () => void)();

    expect(spies.clearCacheAndRestart).toHaveBeenCalledTimes(1);
  });

  it('copies the current chat URL from the public window View menu', () => {
    const onConversation = actions();
    const onSomethingElse = { ...actions(), hasFocusedConversation: vi.fn(() => false) };

    expect(item(appMenuTemplate(onConversation, ACCELERATORS), 'View', 'Copy URL').enabled).toBe(
      true,
    );
    expect(item(appMenuTemplate(onSomethingElse, ACCELERATORS), 'View', 'Copy URL').enabled).toBe(
      false,
    );

    (item(appMenuTemplate(onConversation, ACCELERATORS), 'View', 'Copy URL').click as () => void)();

    expect(onConversation.copyConversationUrl).toHaveBeenCalledTimes(1);
  });

  it('opens the current chat in a new window from the public Window menu', () => {
    const onConversation = actions();
    const onSomethingElse = { ...actions(), hasFocusedConversation: vi.fn(() => false) };

    expect(
      item(appMenuTemplate(onConversation, ACCELERATORS), 'Window', 'Open in New Window').enabled,
    ).toBe(true);
    expect(
      item(appMenuTemplate(onSomethingElse, ACCELERATORS), 'Window', 'Open in New Window').enabled,
    ).toBe(false);

    (
      item(appMenuTemplate(onConversation, ACCELERATORS), 'Window', 'Open in New Window')
        .click as () => void
    )();

    expect(onConversation.openCurrentChatInNewWindow).toHaveBeenCalledTimes(1);
    expect(onConversation.openConversationInNewWindow).not.toHaveBeenCalled();
  });

  it('opens a second window from the Window menu', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'Window', 'New Window').click as () => void)();

    expect(spies.newWindow).toHaveBeenCalledTimes(1);
  });

  it('offers moving the conversation out only while the front window is on one', () => {
    const onConversation = actions();
    const onSomethingElse = { ...actions(), hasFocusedConversation: vi.fn(() => false) };

    expect(
      item(
        appMenuTemplate(onConversation, ACCELERATORS),
        'Window',
        'Move Conversation to New Window',
      ).enabled,
    ).toBe(true);
    expect(
      item(
        appMenuTemplate(onSomethingElse, ACCELERATORS),
        'Window',
        'Move Conversation to New Window',
      ).enabled,
    ).toBe(false);

    (
      item(
        appMenuTemplate(onConversation, ACCELERATORS),
        'Window',
        'Move Conversation to New Window',
      ).click as () => void
    )();
    expect(onConversation.openConversationInNewWindow).toHaveBeenCalledTimes(1);
  });

  it('puts File > New Project on the public window menu and asks the page to open it', () => {
    const { menu, actions: spies } = template();
    const entry = item(menu, 'File', 'New Project');

    (entry.click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('new-project');
  });

  it('puts Find and File > Open Folder on the public window menu and runs their handlers', () => {
    const { menu, actions: spies } = template();
    const openFolder = item(menu, 'File', 'Open Folder');
    const find = submenu(menu, 'Edit').find((entry) => entry.label === 'Find');
    const findItems = (find?.submenu as MenuItemConstructorOptions[] | undefined) ?? [];
    const byLabel = (label: string) => findItems.find((entry) => entry.label === label);

    expect(findItems.map((entry) => entry.label)).toEqual([
      'Find…',
      'Find Next',
      'Find Previous',
      'Find in Files',
    ]);
    expect(openFolder.accelerator).toBe(contractAccelerator('host-open-folder'));
    expect(byLabel('Find…')?.accelerator).toBe(contractAccelerator('host-find'));
    expect(byLabel('Find Next')?.accelerator).toBe(contractAccelerator('host-find-next'));
    expect(byLabel('Find Previous')?.accelerator).toBe(contractAccelerator('host-find-previous'));

    (openFolder.click as () => void)();
    (byLabel('Find…')?.click as () => void)();
    (byLabel('Find Next')?.click as () => void)();
    (byLabel('Find Previous')?.click as () => void)();

    expect(spies.sendHostCommand.mock.calls.map(([command]) => command)).toEqual([
      'open-folder',
      'find',
      'find-next',
      'find-previous',
    ]);
  });

  it('searches files from the public window Edit menu', () => {
    const { menu, actions: spies } = template();

    (editFindItem(menu, 'Find in Files').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('find-in-files');
  });

  it('finds the next match from the public window Edit menu', () => {
    const { menu, actions: spies } = template();

    (editFindItem(menu, 'Find Next').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('find-next');
  });

  it('finds the previous match from the public window Edit menu', () => {
    const { menu, actions: spies } = template();

    (editFindItem(menu, 'Find Previous').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('find-previous');
  });

  it('starts a temporary chat from File > New Temporary Chat on the public window', () => {
    const { menu, actions: spies } = template();

    (item(menu, 'File', 'New Temporary Chat').click as () => void)();

    expect(spies.sendHostCommand).toHaveBeenCalledWith('new-temporary-chat');
  });

  it('starts a new chat from File > New Chat without sending a message', () => {
    const { menu, actions: spies } = template();
    const newChat = item(menu, 'File', 'New Chat');

    expect(newChat.accelerator).toBe(contractAccelerator('host-new-chat'));
    (newChat.click as () => void)();

    expect(spies.newChat).toHaveBeenCalledTimes(1);
    expect(spies.sendHostCommand).not.toHaveBeenCalled();
  });
});

describe.each(MENU_PLATFORMS)('the application menu on %s', (platform) => {
  const { settingsMenu, settingsLabel, updatesMenu, updatesLabel } = platformPlaces(platform);
  const isMac = platform === 'darwin';

  it('checks for updates from the menu the platform puts it in', () => {
    const { menu, actions: spies } = template(actions(), platform);

    (item(menu, updatesMenu, updatesLabel).click as () => void)();

    expect(spies.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('opens settings from the menu the platform puts it in', () => {
    const { menu, actions: spies } = template(actions(), platform);

    (item(menu, settingsMenu, settingsLabel).click as () => void)();

    expect(spies.openSettings).toHaveBeenCalledTimes(1);
  });

  it('keeps Settings and updates where the platform puts them, once each', () => {
    const { menu } = template(actions(), platform);
    const labels = menu.flatMap((entry) =>
      ((entry.submenu as MenuItemConstructorOptions[] | undefined) ?? []).map(
        (child) => child.label,
      ),
    );

    expect(labels.filter((label) => label === settingsLabel)).toHaveLength(1);
    expect(labels.filter((label) => label === updatesLabel)).toHaveLength(1);
  });

  it('puts the Launch at Login box back when the choice could not be saved', () => {
    launchAtLogin.setLaunchAtLogin.mockImplementationOnce(() => {
      throw new Error('The setting could not be saved on this computer, so it was not changed.');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { menu } = template(actions(), platform);
    const launchItem = item(menu, settingsMenu, 'Launch at Login');
    const clicked = { checked: true };

    expect(() =>
      (launchItem.click as (menuItem: { checked: boolean }) => void)(clicked),
    ).not.toThrow();

    expect(launchAtLogin.setLaunchAtLogin).toHaveBeenCalledWith(true);
    expect(clicked.checked).toBe(false);
  });

  it(`${isMac ? 'has' : 'has no'} application menu`, () => {
    const { menu } = template(actions(), platform);

    expect(menu.some((entry) => entry.label === 'AGI Desktop')).toBe(isMac);
  });

  it(`${isMac ? 'offers' : 'leaves out'} the macOS-only Edit, Window and application roles`, () => {
    const { menu } = template(actions(), platform);
    const edit = submenu(menu, 'Edit').map((entry) => entry.role);
    const windowItems = submenu(menu, 'Window');
    const windowRoles = windowItems.map((entry) => entry.role);
    const windowLabels = windowItems.map((entry) => entry.label);

    expect(edit.includes('pasteAndMatchStyle')).toBe(isMac);
    expect(edit.includes('delete')).toBe(isMac);
    expect(windowRoles.includes('front')).toBe(isMac);
    expect(windowLabels.includes('Minimize All')).toBe(isMac);
    expect(windowLabels.includes('Zoom All')).toBe(isMac);
    expect(windowLabels.includes('Arrange in Front')).toBe(isMac);
    expect(windowLabels.includes('Remove Window from Set')).toBe(isMac);
  });

  it(`${isMac ? 'lists' : 'does not list'} the open windows on the Window menu`, () => {
    const spies = actions();
    spies.shellWindows.mockReturnValue([{ id: 4, title: 'Open window title', focused: true }]);
    const { menu } = template(spies, platform);
    const listed = submenu(menu, 'Window').some((entry) => entry.label === 'Open window title');

    expect(listed).toBe(isMac);
  });
});

describe('the dock menu', () => {
  it('opens a chat, a window or Quick Ask from the dock', () => {
    const spies = { newChat: vi.fn(), newWindow: vi.fn(), toggleQuickAsk: vi.fn() };
    const dock = dockMenuTemplate(spies);

    expect(dock.map((entry) => entry.label)).toEqual(['New Chat', 'New Window', 'Quick Ask']);
    for (const entry of dock) (entry.click as () => void)();
    expect(spies.newChat).toHaveBeenCalledTimes(1);
    expect(spies.newWindow).toHaveBeenCalledTimes(1);
    expect(spies.toggleQuickAsk).toHaveBeenCalledTimes(1);
  });
});
