/**
 * Menu-bar / system-tray entry point.
 *
 * The tray is also the fallback UI for both garnish features: if a global
 * shortcut is already owned by another app, these menu items are how the user
 * still reaches Quick Ask and Screenshot to Chat.
 */
import { Menu, Tray, app, nativeImage } from 'electron';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getShortcuts } from './settingsStore';

export interface TrayHandlers {
  onOpen: () => void;
  onNewChat: () => void;
  onQuickAsk: () => void;
  onScreenshot: () => void;
  onCheckForUpdates: () => void;
}

/** Module-level so the Tray is never garbage collected (it would disappear). */
let tray: Tray | null = null;

/**
 * Build the menu-bar image.
 *
 * The icons are read as buffers rather than by path because the packaged app
 * serves them from inside app.asar, where Electron's asar-aware `fs` works but
 * path-based native image loading is unreliable. They are template images:
 * pure black with an alpha shape, which macOS recolors for light/dark menu
 * bars and inverts while the menu is open.
 */
function trayImage(): Electron.NativeImage {
  const assetsDir = path.join(__dirname, 'assets');
  try {
    const image = nativeImage.createFromBuffer(
      readFileSync(path.join(assetsDir, 'trayTemplate.png')),
    );
    try {
      image.addRepresentation({
        scaleFactor: 2,
        buffer: readFileSync(path.join(assetsDir, 'trayTemplate@2x.png')),
      });
    } catch {
      // 1x only: still a valid, if slightly soft, menu-bar icon on retina.
    }
    image.setTemplateImage(true);
    return image;
  } catch (error) {
    console.warn('[tray] tray icon assets missing; falling back to a text-only tray:', error);
    return nativeImage.createEmpty();
  }
}

function buildMenu(handlers: TrayHandlers): Electron.Menu {
  const { quickAskShortcut, screenshotShortcut } = getShortcuts();
  return Menu.buildFromTemplate([
    { label: 'Open AGI Cloud', click: handlers.onOpen },
    { label: 'New Chat', click: handlers.onNewChat },
    { type: 'separator' },
    {
      label: 'Quick Ask',
      // Displayed only: the combo is already owned by globalShortcut, and
      // registering it again here would double-fire the handler.
      accelerator: quickAskShortcut,
      registerAccelerator: false,
      click: handlers.onQuickAsk,
    },
    {
      label: 'Screenshot to Chat',
      accelerator: screenshotShortcut,
      registerAccelerator: false,
      click: handlers.onScreenshot,
    },
    { type: 'separator' },
    { label: 'Check for Updates…', click: handlers.onCheckForUpdates },
    { type: 'separator' },
    { label: 'Quit AGI Cloud', click: () => app.quit() },
  ]);
}

export function createTray(handlers: TrayHandlers): Tray {
  if (tray && !tray.isDestroyed()) return tray;

  tray = new Tray(trayImage());
  tray.setToolTip('AGI Cloud');
  tray.setContextMenu(buildMenu(handlers));

  // On Windows and Linux a left click is expected to open the app; on macOS
  // the click opens the context menu, which is the platform convention.
  if (process.platform !== 'darwin') {
    tray.on('click', handlers.onOpen);
  }

  return tray;
}

/** Rebuild the menu after the shortcut settings change. */
export function refreshTrayMenu(handlers: TrayHandlers): void {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(buildMenu(handlers));
}

export function destroyTray(): void {
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
}
