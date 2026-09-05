import { BrowserWindow, screen } from 'electron';
import { focusPageComposer } from './composerFocus';
import { CLOUD_APP_ORIGIN, REMOTE_SESSION_PARTITION, RENDERER_MODE } from './config';
import { centeredUpperPosition } from './garnishCore';
import { applyRemoteWindowPolicy } from './windowPolicy';

const PANEL_WIDTH = 480;
const PANEL_HEIGHT = 620;

let panel: BrowserWindow | null = null;
let creating = false;

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
    },
  });

  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  applyRemoteWindowPolicy(win);

  win.on('blur', () => {
    if (!win.isDestroyed() && win.isVisible()) win.hide();
  });

  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      if (!win.isDestroyed() && win.isVisible()) win.hide();
    }
  });

  win.on('closed', () => {
    panel = null;
  });

  void win.loadURL(`${CLOUD_APP_ORIGIN}/chat`);
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
 * which window now holds it. Bundled builds have no panel: the renderer they
 * ship is the main window, so that is the surface Quick Ask raises there.
 */
export function surfaceQuickAsk(mainWindow: BrowserWindow | null): BrowserWindow | null {
  if (RENDERER_MODE === 'bundled') {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  const win = ensurePanel();
  reposition(win);
  win.show();
  win.focus();
  win.webContents.focus();
  void focusPageComposer(win);
  return win;
}

export function toggleQuickAsk(mainWindow: BrowserWindow | null): void {
  if (RENDERER_MODE !== 'bundled') {
    const win = ensurePanel();
    if (win.isVisible() && !win.isMinimized()) {
      win.hide();
      return;
    }
  }
  surfaceQuickAsk(mainWindow);
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
  if (RENDERER_MODE === 'bundled') return;
  if (panel || creating) return;
  ensurePanel();
}

export function destroyQuickAsk(): void {
  if (panel && !panel.isDestroyed()) panel.destroy();
  panel = null;
}
