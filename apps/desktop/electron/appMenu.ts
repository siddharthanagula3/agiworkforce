import { Menu, app, type MenuItem, type MenuItemConstructorOptions } from 'electron';
import {
  COMPUTER_USE_STOP_SHORTCUT,
  HOST_MENU_SHORTCUTS,
  type ComputerUsePhase,
  type HostCommand,
} from '@agiworkforce/local-runtime-contract';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import { isLaunchAtLoginEnabled, setLaunchAtLogin } from './launchAtLogin';
import type { WindowArrangement, WindowTile } from './garnishCore';

/**
 * The native application menu.
 *
 * Without one, Electron falls back to a default menu that still carries a
 * working Developer Tools item. This builds the standard editing and window
 * roles deliberately, keeps Reload for everyone, and leaves the developer
 * tools to development builds.
 *
 * Two kinds of accelerator appear below. Most are registered with the system in
 * the usual way. The rest carry `registerAccelerator: false`: their chord is
 * already claimed, by a global shortcut the shell registered or by a key
 * binding the page handles itself, and registering it twice would either fire
 * the action twice or steal it from whoever had it. Those items show the chord
 * and stay clickable, which is what a menu is for.
 */

function changeLaunchAtLogin(item: MenuItem): void {
  try {
    setLaunchAtLogin(item.checked);
  } catch (error) {
    item.checked = isLaunchAtLoginEnabled();
    console.warn('[launch-at-login] the change was not saved:', error);
  }
}

export interface AppMenuActions {
  newChat: () => void;
  newWindow: () => void;
  openCurrentChatInNewWindow: () => void;
  copyConversationUrl: () => void;
  openConversationInNewWindow: () => void;
  hasFocusedConversation: () => boolean;
  isFrontWindowOnTop: () => boolean | null;
  setFrontWindowOnTop: (onTop: boolean) => void;
  toggleQuickAsk: () => void;
  captureScreenshot: () => void;
  openSettings: () => void;
  openLogs: () => void;
  copyDiagnostics: () => void;
  clearCacheAndRestart: () => void;
  openProductHelp: () => void;
  openWhatsNew: () => void;
  openSupport: () => void;
  openOpenSourceNotices: () => void;
  checkForUpdates: () => void;
  sendHostCommand: (command: HostCommand) => void;
  terminalAvailable: () => boolean;
  terminalOpen: () => boolean;
  sideChatAvailable: () => boolean;
  sideChatOpen: () => boolean;
  goBack: () => void;
  goForward: () => void;
  setZoomLevel: (level: number) => void;
  stepZoomLevel: (delta: number) => void;
  takeOverScreen: () => void;
  handBackScreen: () => void;
  stopScreenControl: () => void;
  closeAllWindows: () => void;
  minimizeAllWindows: () => void;
  zoomAllWindows: () => void;
  fillWindow: () => void;
  centerWindow: () => void;
  moveWindow: (tile: WindowTile) => void;
  hasPreviousWindowSize: () => boolean;
  returnToPreviousSize: () => void;
  arrangeWindows: (arrangement: WindowArrangement) => void;
  arrangeInFront: () => void;
  frontWindowIsInSet: () => boolean;
  removeWindowFromSet: () => void;
  shellWindows: () => ShellWindowMenuEntry[];
  focusShellWindow: (id: number) => void;
}

export interface ShellWindowMenuEntry {
  id: number;
  title: string;
  focused: boolean;
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

function settingsItem(actions: AppMenuActions): MenuItemConstructorOptions {
  return {
    label: isMac ? 'Settings…' : 'Settings',
    accelerator: hostAccelerator('host-settings'),
    click: actions.openSettings,
  };
}

/**
 * macOS keeps Settings and Check for Updates under the application's own menu,
 * where every Mac app puts them; elsewhere they stay in File and Help.
 */
function appleMenu(actions: AppMenuActions): MenuItemConstructorOptions[] {
  if (!isMac) return [];
  return [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { label: 'Check for Updates…', click: actions.checkForUpdates },
        { type: 'separator' },
        settingsItem(actions),
        { type: 'separator' },
        {
          label: 'Launch at Login',
          type: 'checkbox',
          checked: isLaunchAtLoginEnabled(),
          click: changeLaunchAtLogin,
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
  computerUse: ComputerUsePhase,
): MenuItemConstructorOptions {
  const items: MenuItemConstructorOptions[] = [
    { label: 'New Chat', accelerator: hostAccelerator('host-new-chat'), click: actions.newChat },
    {
      label: 'New Temporary Chat',
      click: () => actions.sendHostCommand('new-temporary-chat'),
    },
    {
      label: 'New Project',
      click: () => actions.sendHostCommand('new-project'),
    },
    {
      label: 'Open Folder',
      accelerator: hostAccelerator('host-open-folder'),
      click: () => actions.sendHostCommand('open-folder'),
    },
    { type: 'separator' },
    { role: 'close', accelerator: hostAccelerator('host-close-window') },
    { label: 'Close All', click: () => actions.closeAllWindows() },
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
    {
      label: 'Stop Computer Use',
      accelerator: COMPUTER_USE_STOP_SHORTCUT,
      registerAccelerator: false,
      enabled: computerUse !== 'idle',
      click: actions.stopScreenControl,
    },
    {
      label: 'Take Over Screen Control',
      enabled: computerUse === 'active',
      click: actions.takeOverScreen,
    },
    {
      label: 'Hand Back Screen Control',
      enabled: computerUse === 'paused',
      click: actions.handBackScreen,
    },
  ];

  if (!isMac) {
    items.push(
      { type: 'separator' },
      settingsItem(actions),
      { type: 'separator' },
      {
        label: 'Launch at Login',
        type: 'checkbox',
        checked: isLaunchAtLoginEnabled(),
        click: changeLaunchAtLogin,
      },
      { type: 'separator' },
      { role: 'quit' },
    );
  }

  return { label: 'File', submenu: items };
}

function findMenu(actions: AppMenuActions): MenuItemConstructorOptions {
  return {
    label: 'Find',
    submenu: [
      {
        label: 'Find…',
        accelerator: hostAccelerator('host-find'),
        click: () => actions.sendHostCommand('find'),
      },
      {
        label: 'Find Next',
        accelerator: hostAccelerator('host-find-next'),
        click: () => actions.sendHostCommand('find-next'),
      },
      {
        label: 'Find Previous',
        accelerator: hostAccelerator('host-find-previous'),
        click: () => actions.sendHostCommand('find-previous'),
      },
      {
        label: 'Find in Files',
        click: () => actions.sendHostCommand('find-in-files'),
      },
    ],
  };
}

function editMenu(actions: AppMenuActions): MenuItemConstructorOptions {
  const items: MenuItemConstructorOptions[] = [
    { role: 'undo' },
    { role: 'redo' },
    { type: 'separator' },
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    { role: 'selectAll' },
    { type: 'separator' },
    findMenu(actions),
    {
      label: 'Focus Follow-up',
      click: () => actions.sendHostCommand('focus-follow-up'),
    },
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
    {
      label: 'Search',
      accelerator: 'CommandOrControl+Shift+F',
      registerAccelerator: false,
      click: () => actions.sendHostCommand('open-search'),
    },
    {
      label: actions.terminalOpen() ? 'Hide Terminal' : 'Show Terminal',
      enabled: actions.terminalAvailable(),
      accelerator: 'Ctrl+`',
      registerAccelerator: false,
      click: () => actions.sendHostCommand('toggle-terminal'),
    },
    {
      label: actions.sideChatOpen() ? 'Hide Side Chat' : 'Show Side Chat',
      enabled: actions.sideChatAvailable(),
      accelerator: 'CommandOrControl+;',
      click: () => actions.sendHostCommand('toggle-side-chat'),
    },
    { type: 'separator' },
    {
      label: 'New Tab',
      accelerator: hostAccelerator('host-new-tab'),
      click: () => actions.sendHostCommand('new-tab'),
    },
    {
      label: 'Previous Tab',
      accelerator: hostAccelerator('host-previous-tab'),
      click: () => actions.sendHostCommand('previous-tab'),
    },
    {
      label: 'Next Tab',
      accelerator: hostAccelerator('host-next-tab'),
      click: () => actions.sendHostCommand('next-tab'),
    },
    {
      label: 'Show Tabs',
      click: () => actions.sendHostCommand('toggle-chat-tabs'),
    },
    {
      label: 'Reopen Closed Tab',
      click: () => actions.sendHostCommand('reopen-closed-tab'),
    },
    {
      label: 'First Tab',
      click: () => actions.sendHostCommand('focus-first-tab'),
    },
    {
      label: 'Close Tab',
      click: () => actions.sendHostCommand('close-active-tab'),
    },
    {
      label: 'Close Other Tabs',
      click: () => actions.sendHostCommand('close-other-tabs'),
    },
    {
      label: 'Close Tabs to the Right',
      click: () => actions.sendHostCommand('close-tabs-to-the-right'),
    },
    {
      label: 'Copy URL',
      enabled: actions.hasFocusedConversation(),
      click: actions.copyConversationUrl,
    },
    {
      label: 'Second Tab',
      click: () => actions.sendHostCommand('focus-second-tab'),
    },
    {
      label: 'Third Tab',
      click: () => actions.sendHostCommand('focus-third-tab'),
    },
    {
      label: 'Fourth Tab',
      click: () => actions.sendHostCommand('focus-fourth-tab'),
    },
    {
      label: 'Fifth Tab',
      click: () => actions.sendHostCommand('focus-fifth-tab'),
    },
    {
      label: 'Sixth Tab',
      click: () => actions.sendHostCommand('focus-sixth-tab'),
    },
    {
      label: 'Seventh Tab',
      click: () => actions.sendHostCommand('focus-seventh-tab'),
    },
    {
      label: 'Eighth Tab',
      click: () => actions.sendHostCommand('focus-eighth-tab'),
    },
    {
      label: 'Show Changes',
      click: () => actions.sendHostCommand('toggle-changes'),
    },
    {
      label: 'Show Files',
      click: () => actions.sendHostCommand('toggle-files'),
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
  items.push({ type: 'separator' }, { role: 'reload' });
  if (!app.isPackaged) {
    items.push({ role: 'toggleDevTools' });
  }
  return { label: 'View', submenu: items };
}

function historyMenu(actions: AppMenuActions): MenuItemConstructorOptions {
  return {
    label: 'History',
    submenu: [
      { label: 'Back', accelerator: hostAccelerator('host-back'), click: actions.goBack },
      { label: 'Forward', accelerator: hostAccelerator('host-forward'), click: actions.goForward },
      { type: 'separator' },
      {
        label: 'Previous Chat',
        accelerator: hostAccelerator('host-previous-chat'),
        click: () => actions.sendHostCommand('previous-chat'),
      },
      {
        label: 'Next Chat',
        accelerator: hostAccelerator('host-next-chat'),
        click: () => actions.sendHostCommand('next-chat'),
      },
    ],
  };
}

function windowMenu(actions: AppMenuActions): MenuItemConstructorOptions {
  // Close lives on File. Minimize and zoom stay here because the platform
  // owns those window actions. On macOS Minimize All is its own item beside
  // Minimize, and Zoom All is its own item beside Zoom.
  //
  // Moving a conversation out is disabled rather than hidden when the front
  // window is not on one: an item that appears and disappears as the user
  // navigates is harder to find again than one that is visibly unavailable.
  const onTop = actions.isFrontWindowOnTop();
  const items: MenuItemConstructorOptions[] = [
    {
      label: 'New Window',
      accelerator: hostAccelerator('host-new-window'),
      click: actions.newWindow,
    },
    {
      label: 'Open in New Window',
      enabled: actions.hasFocusedConversation(),
      click: actions.openCurrentChatInNewWindow,
    },
    {
      label: 'Move Conversation to New Window',
      enabled: actions.hasFocusedConversation(),
      click: actions.openConversationInNewWindow,
    },
    {
      label: 'Always on Top',
      type: 'checkbox',
      checked: onTop === true,
      enabled: onTop !== null,
      click: (item) => actions.setFrontWindowOnTop(item.checked),
    },
    { type: 'separator' },
    { role: 'minimize' },
    ...(isMac ? [{ label: 'Minimize All', click: () => actions.minimizeAllWindows() }] : []),
    { role: 'zoom' },
    ...(isMac ? [{ label: 'Zoom All', click: () => actions.zoomAllWindows() }] : []),
    { label: 'Fill', click: () => actions.fillWindow() },
    { label: 'Center', click: () => actions.centerWindow() },
    {
      label: 'Move & Resize',
      submenu: [
        { label: 'Halves', enabled: false },
        { label: 'Left', click: () => actions.moveWindow('left') },
        { label: 'Right', click: () => actions.moveWindow('right') },
        { label: 'Top', click: () => actions.moveWindow('top') },
        { label: 'Bottom', click: () => actions.moveWindow('bottom') },
        { type: 'separator' },
        { label: 'Quarters', enabled: false },
        { label: 'Top Left', click: () => actions.moveWindow('top-left') },
        { label: 'Top Right', click: () => actions.moveWindow('top-right') },
        { label: 'Bottom Left', click: () => actions.moveWindow('bottom-left') },
        { label: 'Bottom Right', click: () => actions.moveWindow('bottom-right') },
        { type: 'separator' },
        { label: 'Arrange', enabled: false },
        { label: 'Left & Right', click: () => actions.arrangeWindows('left-right') },
        { label: 'Left & Quarters', click: () => actions.arrangeWindows('left-quarters') },
        { label: 'Right & Left', click: () => actions.arrangeWindows('right-left') },
        { label: 'Right & Quarters', click: () => actions.arrangeWindows('right-quarters') },
        { label: 'Top & Bottom', click: () => actions.arrangeWindows('top-bottom') },
        { label: 'Top & Quarters', click: () => actions.arrangeWindows('top-quarters') },
        { label: 'Bottom & Top', click: () => actions.arrangeWindows('bottom-top') },
        { label: 'Bottom & Quarters', click: () => actions.arrangeWindows('bottom-quarters') },
        { label: 'Quarters', click: () => actions.arrangeWindows('quarters') },
        { type: 'separator' },
        {
          label: 'Return to Previous Size',
          enabled: actions.hasPreviousWindowSize(),
          click: () => actions.returnToPreviousSize(),
        },
      ],
    },
    {
      label: 'Full Screen Tile',
      submenu: [
        { label: 'Left of Screen', click: () => actions.moveWindow('left') },
        { label: 'Right of Screen', click: () => actions.moveWindow('right') },
      ],
    },
  ];
  if (isMac) {
    items.push(
      { type: 'separator' },
      { role: 'front' },
      { label: 'Arrange in Front', click: () => actions.arrangeInFront() },
      {
        label: 'Remove Window from Set',
        enabled: actions.frontWindowIsInSet(),
        click: () => actions.removeWindowFromSet(),
      },
    );
    const open = actions.shellWindows();
    if (open.length > 0) {
      items.push({ type: 'separator' });
      for (const win of open) {
        items.push({
          label: win.title,
          type: 'checkbox',
          checked: win.focused,
          click: () => actions.focusShellWindow(win.id),
        });
      }
    }
  }
  return { label: 'Window', submenu: items };
}

function helpMenu(actions: AppMenuActions): MenuItemConstructorOptions {
  return {
    role: 'help',
    submenu: [
      { label: `${PRODUCT_NAMES.desktop} Help`, click: () => actions.openProductHelp() },
      { label: "What's New", click: () => actions.openWhatsNew() },
      { label: `${PRODUCT_NAMES.desktop} Support`, click: actions.openSupport },
      {
        label: 'Keyboard Shortcuts',
        accelerator: PAGE_KEYBOARD_SHORTCUTS_ACCELERATOR,
        registerAccelerator: false,
        click: () => actions.sendHostCommand('show-keyboard-shortcuts'),
      },
      { label: 'Send Feedback', click: () => actions.sendHostCommand('send-feedback') },
      {
        label: 'Start Performance Trace',
        click: () => actions.sendHostCommand('start-performance-trace'),
      },
      { type: 'separator' },
      {
        label: 'Troubleshooting',
        submenu: [
          { label: 'Open Logs', click: actions.openLogs },
          { label: 'Copy Diagnostics', click: actions.copyDiagnostics },
          { type: 'separator' },
          { label: 'Clear Cache and Restart…', click: actions.clearCacheAndRestart },
        ],
      },
      { label: 'Open-Source Licenses', click: actions.openOpenSourceNotices },
      ...(isMac ? [] : [{ label: 'Check for Updates', click: actions.checkForUpdates }]),
    ],
  };
}

export function appMenuTemplate(
  actions: AppMenuActions,
  accelerators: AppMenuAccelerators,
  computerUse: ComputerUsePhase = 'idle',
): MenuItemConstructorOptions[] {
  return [
    ...appleMenu(actions),
    fileMenu(actions, accelerators, computerUse),
    editMenu(actions),
    viewMenu(actions),
    historyMenu(actions),
    windowMenu(actions),
    helpMenu(actions),
  ];
}

export function buildAppMenu(
  actions: AppMenuActions,
  accelerators: AppMenuAccelerators,
  computerUse: ComputerUsePhase = 'idle',
): Menu {
  return Menu.buildFromTemplate(appMenuTemplate(actions, accelerators, computerUse));
}

export function installAppMenu(
  actions: AppMenuActions,
  accelerators: AppMenuAccelerators,
  computerUse: ComputerUsePhase = 'idle',
): void {
  Menu.setApplicationMenu(buildAppMenu(actions, accelerators, computerUse));
}

export interface DockMenuActions {
  newChat: () => void;
  newWindow: () => void;
  toggleQuickAsk: () => void;
}

export function dockMenuTemplate(actions: DockMenuActions): MenuItemConstructorOptions[] {
  return [
    { label: 'New Chat', click: actions.newChat },
    { label: 'New Window', click: actions.newWindow },
    { label: 'Quick Ask', click: actions.toggleQuickAsk },
  ];
}

export function installDockMenu(actions: DockMenuActions): void {
  app.dock?.setMenu(Menu.buildFromTemplate(dockMenuTemplate(actions)));
}
