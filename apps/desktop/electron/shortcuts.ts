import { Notification, globalShortcut } from 'electron';
import { getShortcuts } from './settingsStore';
import {
  SHORTCUT_KEYS,
  SHORTCUT_LABELS,
  duplicateShortcutKeys,
  isUsableAccelerator,
  type GarnishShortcuts,
  type ShortcutKey,
} from './garnishCore';

export interface GarnishShortcutHandlers {
  onQuickAsk: () => void;
  onScreenshot: () => void;
  onVoice: () => void;
}

export type ShortcutStatus = 'registered' | 'duplicate' | 'taken' | 'malformed';

export interface ShortcutRegistration {
  key: ShortcutKey;
  accelerator: string;
  status: ShortcutStatus;
}

const TAKEN_NOTIFICATION_TITLE = 'Shortcut unavailable';
const DUPLICATE_STATUS_DETAIL = 'is already assigned to another AGI Cloud shortcut';
const TAKEN_STATUS_DETAIL = 'is already in use by another app';
const MALFORMED_STATUS_DETAIL = 'is not a valid accelerator';
const TRAY_FALLBACK_DETAIL = 'Use the AGI Cloud tray menu instead.';

let warnedAboutConflict = false;
let registrations: ShortcutRegistration[] = [];

export function shortcutStatusDetail(status: ShortcutStatus): string | null {
  if (status === 'duplicate') return DUPLICATE_STATUS_DETAIL;
  if (status === 'taken') return TAKEN_STATUS_DETAIL;
  if (status === 'malformed') return MALFORMED_STATUS_DETAIL;
  return null;
}

function warnOnce(accelerator: string, label: string, detail: string): void {
  console.warn(
    `[shortcuts] could not register the ${label} shortcut (${accelerator}), it ${detail}.`,
  );
  if (warnedAboutConflict) return;
  warnedAboutConflict = true;
  if (!Notification.isSupported()) return;
  new Notification({
    title: TAKEN_NOTIFICATION_TITLE,
    body: `${accelerator} ${detail}. ${TRAY_FALLBACK_DETAIL}`,
  }).show();
}

function claim(accelerator: string, handler: () => void): boolean {
  try {
    return globalShortcut.register(accelerator, handler);
  } catch (error) {
    console.warn(`[shortcuts] accelerator rejected (${accelerator}):`, error);
    return false;
  }
}

function registerOne(
  key: ShortcutKey,
  accelerator: string,
  handler: () => void,
  duplicates: readonly ShortcutKey[],
): ShortcutRegistration {
  if (!isUsableAccelerator(accelerator)) {
    return { key, accelerator, status: 'malformed' };
  }
  if (duplicates.includes(key)) {
    return { key, accelerator, status: 'duplicate' };
  }
  return { key, accelerator, status: claim(accelerator, handler) ? 'registered' : 'taken' };
}

export function registerGarnishShortcuts(
  handlers: GarnishShortcutHandlers,
): ShortcutRegistration[] {
  const shortcuts: GarnishShortcuts = getShortcuts();
  const duplicates = duplicateShortcutKeys(shortcuts);
  const handlerFor: Record<ShortcutKey, () => void> = {
    quickAskShortcut: handlers.onQuickAsk,
    screenshotShortcut: handlers.onScreenshot,
    voiceShortcut: handlers.onVoice,
  };

  registrations = SHORTCUT_KEYS.map((key) =>
    registerOne(key, shortcuts[key], handlerFor[key], duplicates),
  );

  for (const registration of registrations) {
    const detail = shortcutStatusDetail(registration.status);
    if (detail) warnOnce(registration.accelerator, SHORTCUT_LABELS[registration.key], detail);
  }

  return registrations;
}

export function shortcutRegistrations(): ShortcutRegistration[] {
  return registrations;
}

export function unregisterGarnishShortcuts(): void {
  globalShortcut.unregisterAll();
  registrations = [];
}
