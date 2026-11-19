import { createHash } from 'node:crypto';
import {
  BrowserWindow,
  clipboard,
  ClipboardItem,
  desktopCapturer,
  Notification,
  screen,
  systemPreferences,
} from 'electron';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import { focusPageComposer } from './composerFocus';
import { showsTrustedPage } from './permissionPolicy';
import { createNativeNotification, showNativeMessage } from './runtime/nativeSurface';
import { pickSourceForDisplay } from './garnishCore';
import { readImagePng } from './runtime/clipboardService';
import { physicalCaptureSize } from './runtime/computerUseProtocol';
import { hideQuickAsk, isQuickAskVisible } from './quickAsk';

const HIDE_SETTLE_MS = 300;
const PASTE_DELAY_MS = 250;
const CLIPBOARD_RESTORE_MS = 1000;

let explainedScreenPermission = false;
let capturing = false;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) {
    console.warn(`[screenshot] ${title}: ${body}`);
    return;
  }
  createNativeNotification({ title, body }).show();
}

function warnIfScreenCaptureBlocked(): void {
  if (process.platform !== 'darwin') return;
  const status = systemPreferences.getMediaAccessStatus('screen');
  if (status !== 'denied' && status !== 'restricted') return;
  if (explainedScreenPermission) return;
  explainedScreenPermission = true;
  void showNativeMessage(null, {
    type: 'info',
    title: 'Screen recording permission needed',
    message: `${PRODUCT_NAMES.desktop} needs permission to capture your screen.`,
    detail: `Open System Settings > Privacy & Security > Screen & System Audio Recording and enable ${PRODUCT_NAMES.desktop}, then relaunch the app. macOS only applies the change after a relaunch.`,
    buttons: ['OK'],
  });
}

interface PasteDestination {
  webContentsId: number;
  url: string;
}

function pasteDestinationOf(win: BrowserWindow | null): PasteDestination | null {
  if (!win || win.isDestroyed() || !showsTrustedPage(win.webContents)) return null;
  return { webContentsId: win.webContents.id, url: win.webContents.getURL() };
}

function isPasteDestination(win: BrowserWindow, destination: PasteDestination): boolean {
  return (
    !win.isDestroyed() &&
    !win.webContents.isLoading() &&
    showsTrustedPage(win.webContents) &&
    win.webContents.id === destination.webContentsId &&
    win.webContents.getURL() === destination.url
  );
}

async function clipboardImageFingerprint(): Promise<string | null> {
  const png = await readImagePng();
  if (!png || png.length === 0) return null;
  return createHash('sha256').update(png).digest('hex');
}

export async function putCaptureOnClipboard(png: Buffer): Promise<string | null> {
  await clipboard.write([
    new ClipboardItem({
      'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }),
    }),
  ]);
  return clipboardImageFingerprint();
}

// Every app can read the clipboard, so the capture stays there only as long
// as the paste needs it; an empty or image clipboard must not keep the screen.
// Anything the user copied since is theirs and is left alone.
export async function takeCaptureBackFromClipboard(
  priorText: string,
  captureFingerprint: string | null,
): Promise<void> {
  if (captureFingerprint === null) return;
  try {
    if ((await clipboardImageFingerprint()) !== captureFingerprint) return;
    if (priorText !== '') {
      await clipboard.writeText(priorText);
      return;
    }
    clipboard.clear();
  } catch (error) {
    console.warn('[screenshot] the capture could not be taken back off the clipboard:', error);
  }
}

async function pasteIntoChat(
  mainWindow: BrowserWindow | null,
  destination: PasteDestination | null,
): Promise<boolean> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    notify('Screenshot copied', 'The chat window is closed, so the image is on your clipboard.');
    return false;
  }

  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.focus();

  await delay(PASTE_DELAY_MS);
  if (mainWindow.isDestroyed()) return true;

  if (
    destination !== null &&
    isPasteDestination(mainWindow, destination) &&
    (await focusPageComposer(mainWindow)) &&
    isPasteDestination(mainWindow, destination)
  ) {
    mainWindow.webContents.paste();
    return true;
  }
  notify(
    'Screenshot copied to clipboard',
    'The chat composer was not ready or the chat changed, so the image was not attached. Press paste in the composer to add it.',
  );
  return false;
}

export async function captureWindowToChat(
  mainWindow: BrowserWindow | null,
  frontWindowId: () => Promise<number | null>,
): Promise<void> {
  if (capturing) return;
  capturing = true;

  const priorText = await clipboard.readText();
  const destination = pasteDestinationOf(mainWindow);
  let captureOnClipboard = false;
  let captureFingerprint: string | null = null;
  let leftForTheUserToPaste = false;

  try {
    warnIfScreenCaptureBlocked();
    const windowId = await frontWindowId();
    if (windowId === null) {
      notify('Window capture failed', 'No other app window is in front to capture.');
      return;
    }
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: physicalCaptureSize(display),
    });
    const source = sources.find((candidate) => candidate.id.startsWith(`window:${windowId}:`));
    if (!source || source.thumbnail.isEmpty()) {
      notify(
        'Window capture failed',
        `That window could not be captured. Check Screen & System Audio Recording permission for ${PRODUCT_NAMES.desktop}, then relaunch.`,
      );
      return;
    }
    captureOnClipboard = true;
    captureFingerprint = await putCaptureOnClipboard(source.thumbnail.toPNG());
    leftForTheUserToPaste = !(await pasteIntoChat(mainWindow, destination));
  } catch (error) {
    console.error('[screenshot] window capture failed:', error);
    notify('Window capture failed', 'The window in front could not be captured.');
  } finally {
    if (captureOnClipboard && !leftForTheUserToPaste) {
      await delay(CLIPBOARD_RESTORE_MS);
      await takeCaptureBackFromClipboard(priorText, captureFingerprint);
    }
    capturing = false;
  }
}

export async function captureToChat(mainWindow: BrowserWindow | null): Promise<void> {
  if (capturing) return;
  capturing = true;

  const priorText = await clipboard.readText();
  const quickAskWasVisible = isQuickAskVisible();
  const mainWasVisible = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible());
  const destination = pasteDestinationOf(mainWindow);
  let captureOnClipboard = false;
  let captureFingerprint: string | null = null;
  let leftForTheUserToPaste = false;

  try {
    warnIfScreenCaptureBlocked();

    if (quickAskWasVisible) hideQuickAsk();
    if (mainWasVisible && mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    await delay(HIDE_SETTLE_MS);

    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: physicalCaptureSize(display),
    });

    const source = pickSourceForDisplay(sources, display.id);
    if (!source || source.thumbnail.isEmpty()) {
      notify(
        'Screenshot failed',
        process.platform === 'darwin'
          ? `No screen content was available. Check Screen & System Audio Recording permission for ${PRODUCT_NAMES.desktop}, then relaunch.`
          : 'No screen content was available.',
      );
      return;
    }

    captureOnClipboard = true;
    captureFingerprint = await putCaptureOnClipboard(source.thumbnail.toPNG());
    leftForTheUserToPaste = !(await pasteIntoChat(mainWindow, destination));
  } catch (error) {
    console.error('[screenshot] capture failed:', error);
    notify('Screenshot failed', 'The screen could not be captured.');
  } finally {
    // In `finally` so a throw between the write and the paste cannot be the
    // one path that leaves the screen on the clipboard.
    if (captureOnClipboard && !leftForTheUserToPaste) {
      await delay(CLIPBOARD_RESTORE_MS);
      await takeCaptureBackFromClipboard(priorText, captureFingerprint);
    }
    if (mainWasVisible && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
    capturing = false;
  }
}
