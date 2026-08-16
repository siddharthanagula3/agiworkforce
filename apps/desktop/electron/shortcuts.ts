import { Notification, globalShortcut } from 'electron';
import { getShortcuts } from './settingsStore';
import { isUsableAccelerator } from './garnishCore';

export interface GarnishShortcutHandlers {
  onQuickAsk: () => void;
  onScreenshot: () => void;
}

let warnedAboutConflict = false;

function warnOnce(accelerator: string, label: string): void {
  console.warn(
    `[shortcuts] could not register ${label} shortcut (${accelerator}) — already in use.`,
  );
  if (warnedAboutConflict) return;
  warnedAboutConflict = true;
  if (!Notification.isSupported()) return;
  new Notification({
    title: 'Shortcut unavailable',
    body: `${accelerator} is already in use by another app. Use the AGI Cloud tray menu instead.`,
  }).show();
}

function register(accelerator: string, label: string, handler: () => void): boolean {
  if (!isUsableAccelerator(accelerator)) {
    console.warn(`[shortcuts] ignoring malformed ${label} accelerator: ${String(accelerator)}`);
    return false;
  }
  try {
    if (globalShortcut.register(accelerator, handler)) return true;
  } catch (error) {
    console.warn(`[shortcuts] ${label} accelerator rejected (${accelerator}):`, error);
    return false;
  }
  warnOnce(accelerator, label);
  return false;
}

export function registerGarnishShortcuts(handlers: GarnishShortcutHandlers): void {
  const { quickAskShortcut, screenshotShortcut } = getShortcuts();
  register(quickAskShortcut, 'Quick Ask', handlers.onQuickAsk);
  register(screenshotShortcut, 'Screenshot to Chat', handlers.onScreenshot);
}

export function unregisterGarnishShortcuts(): void {
  globalShortcut.unregisterAll();
}
