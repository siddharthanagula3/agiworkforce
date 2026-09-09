import { Menu, app, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { isLaunchAtLoginEnabled, setLaunchAtLogin } from './launchAtLogin';

/**
 * The native application menu.
 *
 * Without one, Electron falls back to a default menu that still carries a
 * working Developer Tools item and a Reload that discards renderer state. This
 * builds the standard editing and window roles deliberately and leaves the
 * developer items to development builds.
 */

export interface AppMenuActions {
  newChat: () => void;
  toggleQuickAsk: () => void;
  captureScreenshot: () => void;
  openSettings: () => void;
  openLogs: () => void;
}

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

function fileMenu(actions: AppMenuActions): MenuItemConstructorOptions {
  const items: MenuItemConstructorOptions[] = [
    { label: 'New Chat', accelerator: 'CmdOrCtrl+N', click: actions.newChat },
    { label: 'Quick Ask', accelerator: 'CmdOrCtrl+Shift+A', click: actions.toggleQuickAsk },
    { type: 'separator' },
    {
      label: 'Screenshot to Chat',
      accelerator: 'CmdOrCtrl+Shift+2',
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

function viewMenu(): MenuItemConstructorOptions {
  const items: MenuItemConstructorOptions[] = [
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];
  if (!app.isPackaged) {
    items.unshift({ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' });
  }
  return { label: 'View', submenu: items };
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
      {
        label: 'AGI Workforce Support',
        click: () => {
          void shell.openExternal('https://agiworkforce.com/support');
        },
      },
      { label: 'Open Logs', click: actions.openLogs },
    ],
  };
}

export function buildAppMenu(actions: AppMenuActions): Menu {
  return Menu.buildFromTemplate([
    ...appleMenu(),
    fileMenu(actions),
    editMenu(),
    viewMenu(),
    windowMenu(),
    helpMenu(actions),
  ]);
}

export function installAppMenu(actions: AppMenuActions): void {
  Menu.setApplicationMenu(buildAppMenu(actions));
}

export function refreshAppMenu(actions: AppMenuActions, window: BrowserWindow | null): void {
  void window;
  installAppMenu(actions);
}
