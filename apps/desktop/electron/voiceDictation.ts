import { Notification, type BrowserWindow, type WebContents } from 'electron';
import { focusPageComposer } from './composerFocus';
import { ELECTRON_IPC_CHANNELS } from '../src/lib/tauri-electron/bridgeContract';
import { isQuickAskVisible, quickAskPanel, surfaceQuickAsk } from './quickAsk';

const COMPOSER_SETTLE_MS = 120;
const NO_SURFACE_TITLE = 'No AGI Cloud window';
const NO_SURFACE_BODY = 'Open AGI Cloud from the tray, then press the dictation shortcut again.';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) {
    console.warn(`[dictation] ${title}: ${body}`);
    return;
  }
  new Notification({ title, body }).show();
}

function isLive(win: BrowserWindow | null): win is BrowserWindow {
  return Boolean(win && !win.isDestroyed());
}

/**
 * Where a global dictation press lands. Quick Ask wins while it is up because
 * it is the surface the user is looking at; otherwise a visible main window
 * takes it, and a hidden one falls back to whatever Quick Ask raises today.
 */
export function dictationTarget(mainWindow: BrowserWindow | null): BrowserWindow | null {
  if (isQuickAskVisible()) {
    const panel = quickAskPanel();
    if (isLive(panel)) return panel;
  }
  if (isLive(mainWindow) && mainWindow.isVisible() && !mainWindow.isMinimized()) {
    mainWindow.focus();
    mainWindow.webContents.focus();
    return mainWindow;
  }
  return surfaceQuickAsk(mainWindow);
}

function sendToggle(contents: WebContents): void {
  contents.send(ELECTRON_IPC_CHANNELS.voiceHotkey);
}

/**
 * Both renderer modes attach the preload, so the press reaches a receiver in
 * either. The composer is focused first and the page starts its own capture,
 * which keeps one dictation implementation rather than a second one here.
 */
export async function toggleGlobalDictation(mainWindow: BrowserWindow | null): Promise<void> {
  const target = dictationTarget(mainWindow);
  if (!isLive(target)) {
    notify(NO_SURFACE_TITLE, NO_SURFACE_BODY);
    return;
  }

  await focusPageComposer(target);
  await delay(COMPOSER_SETTLE_MS);
  if (!isLive(target)) return;
  sendToggle(target.webContents);
}
