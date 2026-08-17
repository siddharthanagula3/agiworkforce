import { Menu, Tray, app, nativeImage } from 'electron';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getShortcuts, saveSettings } from './settingsStore';
import { registerGarnishShortcuts, unregisterGarnishShortcuts } from './shortcuts';
import { describeAccelerator, shortcutChoices, type ShortcutKey } from './garnishCore';

export interface TrayHandlers {
  onOpen: () => void;
  onNewChat: () => void;
  onQuickAsk: () => void;
  onScreenshot: () => void;
  onCheckForUpdates: () => void;
}

let tray: Tray | null = null;

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

function applyShortcut(key: ShortcutKey, value: string, handlers: TrayHandlers): void {
  saveSettings({ [key]: value });
  unregisterGarnishShortcuts();
  registerGarnishShortcuts({
    onQuickAsk: handlers.onQuickAsk,
    onScreenshot: handlers.onScreenshot,
  });
  refreshTrayMenu(handlers);
}

function shortcutChoiceItems(
  key: ShortcutKey,
  current: string,
  handlers: TrayHandlers,
): Electron.MenuItemConstructorOptions[] {
  return shortcutChoices(key, current).map((value) => ({
    label: describeAccelerator(value, process.platform),
    type: 'radio',
    checked: value === current,
    click: () => applyShortcut(key, value, handlers),
  }));
}

function buildMenu(handlers: TrayHandlers): Electron.Menu {
  const { quickAskShortcut, screenshotShortcut } = getShortcuts();
  return Menu.buildFromTemplate([
    { label: 'Open AGI Cloud', click: handlers.onOpen },
    { label: 'New Chat', click: handlers.onNewChat },
    { type: 'separator' },
    {
      label: 'Quick Ask',
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
    {
      label: 'Shortcuts',
      submenu: [
        { label: 'Quick Ask', enabled: false },
        ...shortcutChoiceItems('quickAskShortcut', quickAskShortcut, handlers),
        { type: 'separator' },
        { label: 'Screenshot to Chat', enabled: false },
        ...shortcutChoiceItems('screenshotShortcut', screenshotShortcut, handlers),
      ],
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

  if (process.platform !== 'darwin') {
    tray.on('click', handlers.onOpen);
  }

  return tray;
}

export function refreshTrayMenu(handlers: TrayHandlers): void {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(buildMenu(handlers));
}

export function destroyTray(): void {
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
}
