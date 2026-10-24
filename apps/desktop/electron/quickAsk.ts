import { BrowserWindow, screen, type WebPreferences } from 'electron';
import { CLOUD_APP_ORIGIN, REMOTE_SESSION_PARTITION } from './config';
import { centeredUpperPosition } from './garnishCore';
import { applyRemoteWindowPolicy } from './windowPolicy';

const PANEL_WIDTH = 480;
const PANEL_HEIGHT = 620;
const ABORTED_LOAD_ERROR = -3;
const QUICK_ASK_PATH = '/quick-ask';
const QUICK_ASK_URL = `${CLOUD_APP_ORIGIN}${QUICK_ASK_PATH}`;

let panel: BrowserWindow | null = null;
let panelLoadFailed = false;
let panelLeftQuickAsk = false;
let openInMainWindow: (route: string) => void = () => undefined;
let creating = false;
let bridge: Pick<WebPreferences, 'preload' | 'additionalArguments'> = {};

export function configureQuickAskBridge(
  preferences: Pick<WebPreferences, 'preload' | 'additionalArguments'>,
): void {
  bridge = preferences;
}

/**
 * Where the main window should go when the panel is sent somewhere other than
 * Quick Ask, or null when the destination is Quick Ask or not this app.
 */
export function routeLeavingQuickAsk(url: string, appOrigin: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== new URL(appOrigin).origin) return null;
  if (parsed.pathname === QUICK_ASK_PATH || parsed.pathname.startsWith(`${QUICK_ASK_PATH}/`)) {
    return null;
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * The panel is sized for one exchange, so a conversation opened in full, an
 * upgrade page or settings belongs in the main window, as in the ChatGPT and
 * Claude companion windows.
 */
export function configureQuickAskHandoff(handler: (route: string) => void): void {
  openInMainWindow = handler;
}

function createPanel(): BrowserWindow {
  const win = new BrowserWindow({
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    ...(process.platform === 'darwin'
      ? { vibrancy: 'sidebar' as const, roundedCorners: true }
      : {}),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      partition: REMOTE_SESSION_PARTITION,
      ...bridge,
    },
  });

  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  applyRemoteWindowPolicy(win, { onSignInRequired: (url) => handOff(url) });

  win.on('blur', () => {
    if (!win.isDestroyed() && win.isVisible()) win.hide();
  });

  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      if (!win.isDestroyed() && win.isVisible()) win.hide();
    }
  });

  // The panel is warmed at launch and then kept, so a load that failed then,
  // offline or mid-sleep, would otherwise stay blank until the app restarts.
  win.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== ABORTED_LOAD_ERROR) panelLoadFailed = true;
  });

  const handOff = (url: string): boolean => {
    const route = routeLeavingQuickAsk(url, CLOUD_APP_ORIGIN);
    if (route === null) return false;
    panelLeftQuickAsk = true;
    if (win.isDestroyed() || !win.isVisible()) return true;
    win.hide();
    openInMainWindow(route);
    return true;
  };
  win.webContents.on('will-navigate', (event, url) => {
    if (handOff(url)) event.preventDefault();
  });
  win.webContents.on('did-navigate', (_event, url) => {
    handOff(url);
  });
  win.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (isMainFrame) handOff(url);
  });

  win.on('closed', () => {
    panel = null;
    panelLoadFailed = false;
    panelLeftQuickAsk = false;
  });

  panelLoadFailed = false;
  panelLeftQuickAsk = false;
  void win.loadURL(QUICK_ASK_URL);
  return win;
}

function ensurePanel(): BrowserWindow {
  if (panel && !panel.isDestroyed()) return panel;
  creating = true;
  try {
    panel = createPanel();
    return panel;
  } finally {
    creating = false;
  }
}

function reposition(win: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y } = centeredUpperPosition(display.workArea, PANEL_WIDTH, PANEL_HEIGHT);
  win.setBounds({ x, y, width: PANEL_WIDTH, height: PANEL_HEIGHT });
}

/**
 * Bring the Quick Ask surface up without the toggle's hide branch, and report
 * which window now holds it.
 */
export function surfaceQuickAsk(): BrowserWindow {
  const win = ensurePanel();
  if (panelLoadFailed || panelLeftQuickAsk) {
    panelLoadFailed = false;
    panelLeftQuickAsk = false;
    void win.loadURL(QUICK_ASK_URL);
  }
  reposition(win);
  win.show();
  win.focus();
  win.webContents.focus();
  return win;
}

export function toggleQuickAsk(): void {
  const win = ensurePanel();
  if (win.isVisible() && !win.isMinimized()) {
    win.hide();
    return;
  }
  surfaceQuickAsk();
}

export function quickAskPanel(): BrowserWindow | null {
  return panel && !panel.isDestroyed() ? panel : null;
}

export function hideQuickAsk(): void {
  if (panel && !panel.isDestroyed() && panel.isVisible()) panel.hide();
}

export function isQuickAskVisible(): boolean {
  return Boolean(panel && !panel.isDestroyed() && panel.isVisible());
}

export function warmUpQuickAsk(): void {
  if (panel || creating) return;
  ensurePanel();
}

export function destroyQuickAsk(): void {
  if (panel && !panel.isDestroyed()) panel.destroy();
  panel = null;
}
