/**
 * Global (system-wide) shortcuts for the shell garnish.
 *
 * Registration is best-effort: another app may already own a combo, and on
 * macOS an accelerator can also be silently claimed by the system. A failed
 * registration must never be silent — the tray menu is the always-available
 * fallback, so we say so once instead of leaving a dead hotkey.
 */
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
    // Electron throws on an accelerator it cannot parse and returns false when
    // the OS refuses the combo; both must leave the app running.
    if (globalShortcut.register(accelerator, handler)) return true;
  } catch (error) {
    console.warn(`[shortcuts] ${label} accelerator rejected (${accelerator}):`, error);
    return false;
  }
  warnOnce(accelerator, label);
  return false;
}

/** Register both garnish hotkeys from persisted settings. Safe to re-run. */
export function registerGarnishShortcuts(handlers: GarnishShortcutHandlers): void {
  const { quickAskShortcut, screenshotShortcut } = getShortcuts();
  register(quickAskShortcut, 'Quick Ask', handlers.onQuickAsk);
  register(screenshotShortcut, 'Screenshot to Chat', handlers.onScreenshot);
}

/** Release every global shortcut. Must run on `will-quit`. */
export function unregisterGarnishShortcuts(): void {
  globalShortcut.unregisterAll();
}
