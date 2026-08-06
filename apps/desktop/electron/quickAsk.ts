/**
 * Quick Ask: a small always-on-top panel summoned by a global shortcut.
 *
 * It is the same hosted `/chat` page as the main window, in the same session
 * partition — so it is already signed in, already has the user's models and
 * history, and needs no second renderer to maintain. The panel is created
 * once and hidden (never destroyed) on dismiss: destroying it would throw the
 * page away and make every summon a cold page load.
 */
import { BrowserWindow, screen } from 'electron';
import { focusPageComposer } from './composerFocus';
import { CLOUD_APP_ORIGIN, REMOTE_SESSION_PARTITION, RENDERER_MODE } from './config';
import { centeredUpperPosition } from './garnishCore';
import { applyRemoteWindowPolicy } from './windowPolicy';

const PANEL_WIDTH = 480;
const PANEL_HEIGHT = 620;

let panel: BrowserWindow | null = null;
/** Guards the warm-up timer against racing a user-triggered create. */
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
    // Rounded corners read as a panel rather than a clipped window on macOS.
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

  // Float above full-screen apps too, which is the point of a summon panel.
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  applyRemoteWindowPolicy(win);

  // Dismiss-on-blur is the expected panel behavior. Hide only — the window
  // and its loaded page survive so the next summon is instant.
  win.on('blur', () => {
    if (!win.isDestroyed() && win.isVisible()) win.hide();
  });

  // Escape dismisses too.
  //
  // The panel is frameless, non-resizable and always-on-top, so it has no close
  // button and no title bar — blur was the ONLY exit. That is fine when the user
  // knows to click away, and a trap when they do not: a floating window with no
  // visible affordance, sitting above every other app. Escape is what a summon
  // panel is expected to answer to (Spotlight, Raycast, the VS Code palette).
  //
  // Handled with before-input-event rather than in the renderer: the panel loads
  // the hosted cloud app, so the shell cannot rely on that page binding a key.
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

/** Move the panel onto the display the user is currently pointing at. */
function reposition(win: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y } = centeredUpperPosition(display.workArea, PANEL_WIDTH, PANEL_HEIGHT);
  win.setBounds({ x, y, width: PANEL_WIDTH, height: PANEL_HEIGHT });
}

/**
 * Summon or dismiss the panel.
 *
 * In bundled mode there is no second hosted page to load, so the shortcut
 * falls back to raising the main window — the caller supplies it.
 */
export function toggleQuickAsk(mainWindow: BrowserWindow | null): void {
  if (RENDERER_MODE === 'bundled') {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  const win = ensurePanel();
  if (win.isVisible() && !win.isMinimized()) {
    win.hide();
    return;
  }
  reposition(win);
  win.show();
  win.focus();
  win.webContents.focus();
  // A summon panel exists to be typed into immediately. Without this, focus
  // sits on the page's skip-to-content link, which both swallows the first
  // keystrokes and renders as a large focused button across the panel header.
  void focusPageComposer(win);
}

export function hideQuickAsk(): void {
  if (panel && !panel.isDestroyed() && panel.isVisible()) panel.hide();
}

export function isQuickAskVisible(): boolean {
  return Boolean(panel && !panel.isDestroyed() && panel.isVisible());
}

/**
 * Pre-create the panel (hidden) so the first summon does not pay for a cold
 * page load. Called on a delay after startup so it never competes with the
 * main window's first paint.
 */
export function warmUpQuickAsk(): void {
  if (RENDERER_MODE === 'bundled') return;
  if (panel || creating) return;
  ensurePanel();
}

export function destroyQuickAsk(): void {
  if (panel && !panel.isDestroyed()) panel.destroy();
  panel = null;
}
