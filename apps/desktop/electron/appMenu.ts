import { Menu, app, type MenuItemConstructorOptions } from 'electron';
import type { HostCommand } from '@agiworkforce/local-runtime-contract';
import { isLaunchAtLoginEnabled, setLaunchAtLogin } from './launchAtLogin';

/**
 * The native application menu.
 *
 * Without one, Electron falls back to a default menu that still carries a
 * working Developer Tools item and a Reload that discards renderer state. This
 * builds the standard editing and window roles deliberately and leaves the
 * developer items to development builds.
 *
 * Two kinds of accelerator appear below. Most are registered with the system in
 * the usual way. The rest carry `registerAccelerator: false`: their chord is
 * already claimed, by a global shortcut the shell registered or by a key
 * binding the page handles itself, and registering it twice would either fire
 * the action twice or steal it from whoever had it. Those items show the chord
 * and stay clickable, which is what a menu is for.
 */

export interface AppMenuActions {
  newChat: () => void;
  toggleQuickAsk: () => void;
  captureScreenshot: () => void;
  openSettings: () => void;
  openLogs: () => void;
  openSupport: () => void;
  checkForUpdates: () => void;
  sendHostCommand: (command: HostCommand) => void;
  goBack: () => void;
  goForward: () => void;
  setZoomLevel: (level: number) => void;
  stepZoomLevel: (delta: number) => void;
}

export interface AppMenuAccelerators {
  quickAsk: string;
  screenshot: string;
}

/**
 * What the page binds for the two actions the View and Help menus hand back to
 * it. `apps/web/features/chat/hooks/use-keyboard-shortcuts.ts` is where those
 * bindings live; the menu shows them rather than claiming them.
 */
const PAGE_TOGGLE_SIDEBAR_ACCELERATOR = 'CommandOrControl+B';
const PAGE_KEYBOARD_SHORTCUTS_ACCELERATOR = 'CommandOrControl+/';

const isMac = process.platform === 'darwin';

function appleMenu(): MenuItemConstructorOptions[] {
  if (!isMac) return [];
  return [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Launch at Login',
          type: 'checkbox',
          checked: isLaunchAtLoginEnabled(),
          click: (item) => setLaunchAtLogin(item.checked),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
  ];
}

function fileMenu(
  actions: AppMenuActions,
  accelerators: AppMenuAccelerators,
): MenuItemConstructorOptions {
  const items: MenuItemConstructorOptions[] = [
    { label: 'New Chat', accelerator: 'CmdOrCtrl+N', click: actions.newChat },
    {
      label: 'Quick Ask',
      accelerator: accelerators.quickAsk,
      registerAccelerator: false,
      click: actions.toggleQuickAsk,
    },
    { type: 'separator' },
    {
      label: 'Screenshot to Chat',
      accelerator: accelerators.screenshot,
      registerAccelerator: false,
      click: actions.captureScreenshot,
    },
    { type: 'separator' },
    { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: actions.openSettings },
  ];

  if (!isMac) {
    items.push(
      { type: 'separator' },
      {
        label: 'Launch at Login',
        type: 'checkbox',
        checked: isLaunchAtLoginEnabled(),
        click: (item) => setLaunchAtLogin(item.checked),
      },
      { type: 'separator' },
      { role: 'quit' },
    );
  }

  return { label: 'File', submenu: items };
}

function editMenu(): MenuItemConstructorOptions {
  const items: MenuItemConstructorOptions[] = [
    { role: 'undo' },
    { role: 'redo' },
    { type: 'separator' },
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    { role: 'selectAll' },
  ];
  if (isMac) {
    items.splice(6, 0, { role: 'pasteAndMatchStyle' }, { role: 'delete' });
  }
  return { label: 'Edit', submenu: items };
}

function viewMenu(actions: AppMenuActions): MenuItemConstructorOptions {
  const items: MenuItemConstructorOptions[] = [
    {
      label: 'Toggle Sidebar',
      accelerator: PAGE_TOGGLE_SIDEBAR_ACCELERATOR,
      registerAccelerator: false,
      click: () => actions.sendHostCommand('toggle-sidebar'),
    },
    { type: 'separator' },
    { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => actions.setZoomLevel(0) },
    { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: () => actions.stepZoomLevel(1) },
    { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => actions.stepZoomLevel(-1) },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];
  if (!app.isPackaged) {
    items.push({ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' });
  }
  return { label: 'View', submenu: items };
}

function historyMenu(actions: AppMenuActions): MenuItemConstructorOptions {
  return {
    label: 'History',
    submenu: [
      { label: 'Back', accelerator: 'CmdOrCtrl+[', click: actions.goBack },
      { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: actions.goForward },
    ],
  };
}

function windowMenu(): MenuItemConstructorOptions {
  const items: MenuItemConstructorOptions[] = [{ role: 'minimize' }, { role: 'zoom' }];
  if (isMac) {
    items.push({ type: 'separator' }, { role: 'front' });
  } else {
    items.push({ role: 'close' });
  }
  return { label: 'Window', submenu: items };
}

function helpMenu(actions: AppMenuActions): MenuItemConstructorOptions {
  return {
    role: 'help',
    submenu: [
      { label: 'AGI Workforce Support', click: actions.openSupport },
      {
        label: 'Keyboard Shortcuts',
        accelerator: PAGE_KEYBOARD_SHORTCUTS_ACCELERATOR,
        registerAccelerator: false,
        click: () => actions.sendHostCommand('show-keyboard-shortcuts'),
      },
      { type: 'separator' },
      { label: 'Open Logs', click: actions.openLogs },
      { label: 'Check for Updates', click: actions.checkForUpdates },
    ],
  };
}

export function appMenuTemplate(
  actions: AppMenuActions,
  accelerators: AppMenuAccelerators,
): MenuItemConstructorOptions[] {
  return [
    ...appleMenu(),
    fileMenu(actions, accelerators),
    editMenu(),
    viewMenu(actions),
    historyMenu(actions),
    windowMenu(),
    helpMenu(actions),
  ];
}

export function buildAppMenu(actions: AppMenuActions, accelerators: AppMenuAccelerators): Menu {
  return Menu.buildFromTemplate(appMenuTemplate(actions, accelerators));
}

export function installAppMenu(actions: AppMenuActions, accelerators: AppMenuAccelerators): void {
  Menu.setApplicationMenu(buildAppMenu(actions, accelerators));
}
