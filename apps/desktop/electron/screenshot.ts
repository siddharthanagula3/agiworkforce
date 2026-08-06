/**
 * Screenshot to Chat: capture the display under the cursor and drop it into
 * the composer of the hosted chat page.
 *
 * The clipboard is the transport. The renderer is the hosted web app, so the
 * shell cannot hand it a file handle or a native attachment API — but the
 * composer already accepts pasted images, and `webContents.paste()` drives
 * that path exactly as a user would. The user's prior clipboard text is put
 * back afterwards so an ambient hotkey never eats what they had copied.
 */
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

/** Long enough for the window-hide animation to finish before we grab pixels. */
const HIDE_SETTLE_MS = 300;
/** Give the restored page a moment to focus the composer before pasting. */
const PASTE_DELAY_MS = 250;
/** Leave the image on the clipboard long enough for the paste to consume it. */
const CLIPBOARD_RESTORE_MS = 1000;

/** Per-run guard: we explain the macOS permission at most once per launch. */
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

/**
 * macOS gates screen capture behind TCC. We explain the flow once, but still
 * attempt the capture: the first attempt is what registers the app in System
 * Settings -> Privacy & Security -> Screen & System Audio Recording, and
 * without it the app never appears in that list at all.
 */
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

/**
 * Capture the display under the cursor and paste it into the chat composer.
 * Every failure path is non-fatal: the user gets a notification and their
 * windows and clipboard back.
 */
export async function captureToChat(mainWindow: BrowserWindow | null): Promise<void> {
  if (capturing) return;
  capturing = true;

  const priorText = clipboard.readText();
  const quickAskWasVisible = isQuickAskVisible();
  const mainWasVisible = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible());

  try {
    warnIfScreenCaptureBlocked();

    // Get our own chrome out of the shot.
    if (quickAskWasVisible) hideQuickAsk();
    if (mainWasVisible && mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    await delay(HIDE_SETTLE_MS);

    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      // Ask for native pixels; the default thumbnail is a 150px preview.
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
      // Nothing will consume the image; leave it rather than restoring text.
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
      // Leave the image on the clipboard: it is the only copy the user has.
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
    // We hid the window to take the shot, so every exit path — including the
    // early returns above — has to put it back. The success path has already
    // shown it, which makes this a no-op there.
    if (mainWasVisible && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
    capturing = false;
  }
}
