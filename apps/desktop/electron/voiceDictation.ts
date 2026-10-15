import { Notification, type BrowserWindow, type WebContents } from 'electron';
import { recordDesktopEvent } from './runtime/desktopTelemetryService';
import { createNativeNotification } from './runtime/nativeSurface';
import { focusPageComposer } from './composerFocus';
import { ELECTRON_IPC_CHANNELS } from '../src/lib/tauri-electron/bridgeContract';
import { isQuickAskVisible, quickAskPanel, surfaceQuickAsk } from './quickAsk';

const COMPOSER_SETTLE_MS = 120;
const OPENING_TITLE = 'Opening AGI Cloud';
const OPENING_BODY = 'Press the dictation shortcut again once the window is open.';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) {
    console.warn(`[dictation] ${title}: ${body}`);
    return;
  }
  createNativeNotification({ title, body }).show();
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
 * The main window and Quick Ask both attach the preload, so the press reaches
 * a receiver in either. The composer is focused first and the page starts its
 * own capture, which keeps one dictation implementation rather than a second
 * one here. When nothing could be raised, the press opens the main window and
 * says to press again rather than sending into a document still loading.
 */
export async function toggleGlobalDictation(
  mainWindow: BrowserWindow | null,
  openMainWindow: () => void,
): Promise<void> {
  const target = dictationTarget(mainWindow);
  if (!isLive(target)) {
    openMainWindow();
    recordDesktopEvent({ domain: 'voice_shortcut', outcome: 'refused', cause: 'not_configured' });
    notify(OPENING_TITLE, OPENING_BODY);
    return;
  }

  await focusPageComposer(target);
  await delay(COMPOSER_SETTLE_MS);
  if (!isLive(target)) {
    recordDesktopEvent({ domain: 'voice_shortcut', outcome: 'failed', cause: 'cancelled' });
    return;
  }
  sendToggle(target.webContents);
  recordDesktopEvent({ domain: 'voice_shortcut', outcome: 'ok' });
}
