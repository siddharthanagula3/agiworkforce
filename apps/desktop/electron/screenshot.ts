import {
  BrowserWindow,
  Notification,
  clipboard,
  desktopCapturer,
  dialog,
  screen,
  systemPreferences,
} from 'electron';
import { focusPageComposer } from './composerFocus';
import { pickSourceForDisplay } from './garnishCore';
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
  new Notification({ title, body }).show();
}

function warnIfScreenCaptureBlocked(): void {
  if (process.platform !== 'darwin') return;
  const status = systemPreferences.getMediaAccessStatus('screen');
  if (status !== 'denied' && status !== 'restricted') return;
  if (explainedScreenPermission) return;
  explainedScreenPermission = true;
  void dialog.showMessageBox({
    type: 'info',
    title: 'Screen recording permission needed',
    message: 'AGI Cloud needs permission to capture your screen.',
    detail:
      'Open System Settings > Privacy & Security > Screen & System Audio Recording and enable AGI Cloud, then relaunch the app. macOS only applies the change after a relaunch.',
    buttons: ['OK'],
  });
}

export async function captureToChat(mainWindow: BrowserWindow | null): Promise<void> {
  if (capturing) return;
  capturing = true;

  const priorText = clipboard.readText();
  const quickAskWasVisible = isQuickAskVisible();
  const mainWasVisible = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible());

  try {
    warnIfScreenCaptureBlocked();

    if (quickAskWasVisible) hideQuickAsk();
    if (mainWasVisible && mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    await delay(HIDE_SETTLE_MS);

    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(display.size.width * display.scaleFactor),
        height: Math.round(display.size.height * display.scaleFactor),
      },
    });

    const source = pickSourceForDisplay(sources, display.id);
    if (!source || source.thumbnail.isEmpty()) {
      notify(
        'Screenshot failed',
        process.platform === 'darwin'
          ? 'No screen content was available. Check Screen & System Audio Recording permission for AGI Cloud, then relaunch.'
          : 'No screen content was available.',
      );
      return;
    }

    clipboard.writeImage(source.thumbnail);

    if (!mainWindow || mainWindow.isDestroyed()) {
      notify('Screenshot copied', 'The chat window is closed, so the image is on your clipboard.');
      return;
    }

    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.focus();

    await delay(PASTE_DELAY_MS);
    if (mainWindow.isDestroyed()) return;

    if (await focusPageComposer(mainWindow)) {
      mainWindow.webContents.paste();
    } else {
      notify(
        'Screenshot copied to clipboard',
        'The chat composer was not ready, so the image was not attached. Press paste in the composer to add it.',
      );
      return;
    }

    if (priorText !== '') {
      await delay(CLIPBOARD_RESTORE_MS);
      clipboard.writeText(priorText);
    }
  } catch (error) {
    console.error('[screenshot] capture failed:', error);
    notify('Screenshot failed', 'The screen could not be captured.');
  } finally {
    if (mainWasVisible && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
    capturing = false;
  }
}
