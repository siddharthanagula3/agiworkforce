import { Menu, Tray, app, nativeImage } from 'electron';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getShortcuts, saveSettings } from './settingsStore';
import {
  registerGarnishShortcuts,
  shortcutRegistrations,
  shortcutStatusDetail,
  unregisterGarnishShortcuts,
} from './shortcuts';
import {
  SHORTCUT_KEYS,
  SHORTCUT_LABELS,
  describeAccelerator,
  shortcutChoices,
  type ShortcutKey,
} from './garnishCore';

export interface TrayHandlers {
  onOpen: () => void;
  onNewChat: () => void;
  onQuickAsk: () => void;
  onScreenshot: () => void;
  onVoice: () => void;
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
    onVoice: handlers.onVoice,
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

export function shortcutHeadingLabel(key: ShortcutKey): string {
  const status = shortcutRegistrations().find((entry) => entry.key === key)?.status;
  const detail = status ? shortcutStatusDetail(status) : null;
  return detail ? `${SHORTCUT_LABELS[key]} (${detail})` : SHORTCUT_LABELS[key];
}

function shortcutSubmenu(
  shortcuts: Record<ShortcutKey, string>,
  handlers: TrayHandlers,
): Electron.MenuItemConstructorOptions[] {
  return SHORTCUT_KEYS.flatMap((key, index) => [
    ...(index === 0 ? [] : ([{ type: 'separator' }] as Electron.MenuItemConstructorOptions[])),
    { label: shortcutHeadingLabel(key), enabled: false },
    ...shortcutChoiceItems(key, shortcuts[key], handlers),
  ]);
}

function buildMenu(handlers: TrayHandlers): Electron.Menu {
  const shortcuts = getShortcuts();
  return Menu.buildFromTemplate([
    { label: 'Open AGI Cloud', click: handlers.onOpen },
    { label: 'New Chat', click: handlers.onNewChat },
    { type: 'separator' },
    {
      label: SHORTCUT_LABELS.quickAskShortcut,
      accelerator: shortcuts.quickAskShortcut,
      registerAccelerator: false,
      click: handlers.onQuickAsk,
    },
    {
      label: SHORTCUT_LABELS.screenshotShortcut,
      accelerator: shortcuts.screenshotShortcut,
      registerAccelerator: false,
      click: handlers.onScreenshot,
    },
    {
      label: SHORTCUT_LABELS.voiceShortcut,
      accelerator: shortcuts.voiceShortcut,
      registerAccelerator: false,
      click: handlers.onVoice,
    },
    { type: 'separator' },
    {
      label: 'Shortcuts',
      submenu: shortcutSubmenu(shortcuts, handlers),
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
