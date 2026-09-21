import { Menu, app, type MenuItemConstructorOptions } from 'electron';
import { HOST_MENU_SHORTCUTS, type HostCommand } from '@agiworkforce/local-runtime-contract';
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
  newWindow: () => void;
  openConversationInNewWindow: () => void;
  hasFocusedConversation: () => boolean;
  toggleQuickAsk: () => void;
  captureScreenshot: () => void;
  openSettings: () => void;
  openLogs: () => void;
  copyDiagnostics: () => void;
  openSupport: () => void;
  checkForUpdates: () => void;
  sendHostCommand: (command: HostCommand) => void;
  goBack: () => void;
  goForward: () => void;
  setZoomLevel: (level: number) => void;
  stepZoomLevel: (delta: number) => void;
  takeOverScreen: () => void;
  handBackScreen: () => void;
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

/**
 * The chords this menu claims come from the contract, which is also what the
 * page's shortcut sheet renders. A literal here would let the menu and the
 * sheet describe different keys for the same command.
 */
function hostAccelerator(id: string): string {
  const shortcut = HOST_MENU_SHORTCUTS.find((candidate) => candidate.id === id);
  if (!shortcut) throw new Error(`no host menu shortcut named ${id}`);
  return shortcut.accelerator;
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

function fileMenu(
  actions: AppMenuActions,
  accelerators: AppMenuAccelerators,
): MenuItemConstructorOptions {
  const items: MenuItemConstructorOptions[] = [
    { label: 'New Chat', accelerator: hostAccelerator('host-new-chat'), click: actions.newChat },
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
    { label: 'Take Over Screen Control', click: actions.takeOverScreen },
    { label: 'Hand Back Screen Control', click: actions.handBackScreen },
    { type: 'separator' },
    {
      label: 'Settings',
      accelerator: hostAccelerator('host-settings'),
      click: actions.openSettings,
    },
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
    {
      label: 'Actual Size',
      accelerator: hostAccelerator('host-actual-size'),
      click: () => actions.setZoomLevel(0),
    },
    {
      label: 'Zoom In',
      accelerator: hostAccelerator('host-zoom-in'),
      click: () => actions.stepZoomLevel(1),
    },
    {
      label: 'Zoom Out',
      accelerator: hostAccelerator('host-zoom-out'),
      click: () => actions.stepZoomLevel(-1),
    },
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
      { label: 'Back', accelerator: hostAccelerator('host-back'), click: actions.goBack },
      { label: 'Forward', accelerator: hostAccelerator('host-forward'), click: actions.goForward },
    ],
  };
}

function windowMenu(actions: AppMenuActions): MenuItemConstructorOptions {
  // Close is on every platform: macOS reads a window with no Cmd+W as broken,
  // and the app survives losing its last window because `activate`, a second
  // launch and a deep link all bring one back.
  //
  // Moving a conversation out is disabled rather than hidden when the front
  // window is not on one: an item that appears and disappears as the user
  // navigates is harder to find again than one that is visibly unavailable.
  const items: MenuItemConstructorOptions[] = [
    { label: 'New Window', click: actions.newWindow },
    {
      label: 'Move Conversation to New Window',
      enabled: actions.hasFocusedConversation(),
      click: actions.openConversationInNewWindow,
    },
    { type: 'separator' },
    { role: 'minimize' },
    { role: 'zoom' },
    { role: 'close', accelerator: hostAccelerator('host-close-window') },
  ];
  if (isMac) {
    items.push({ type: 'separator' }, { role: 'front' });
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
      { label: 'Copy Diagnostics', click: actions.copyDiagnostics },
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
    windowMenu(actions),
    helpMenu(actions),
  ];
}

export function buildAppMenu(actions: AppMenuActions, accelerators: AppMenuAccelerators): Menu {
  return Menu.buildFromTemplate(appMenuTemplate(actions, accelerators));
}

export function installAppMenu(actions: AppMenuActions, accelerators: AppMenuAccelerators): void {
  Menu.setApplicationMenu(buildAppMenu(actions, accelerators));
}
