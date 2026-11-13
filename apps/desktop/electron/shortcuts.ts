import { Notification, globalShortcut } from 'electron';
import { getShortcuts, saveSettings, saveSettingsDurably } from './settingsStore';
import { createNativeNotification } from './runtime/nativeSurface';
import type { HostShortcutStatus } from '@agiworkforce/local-runtime-contract';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import {
  SHORTCUT_KEYS,
  SHORTCUT_LABELS,
  duplicateShortcutKeys,
  isShortcutOff,
  isUsableAccelerator,
  shortcutMayBeOff,
  type GarnishShortcuts,
  type ShortcutKey,
} from './garnishCore';

export interface GarnishShortcutHandlers {
  onQuickAsk: () => void;
  onNewChat: () => void;
  onScreenshot: () => void;
  onWindowShot: () => void;
  onVoice: () => void;
  onStop: () => void;
}

export type ShortcutStatus = HostShortcutStatus;

export interface ShortcutRegistration {
  key: ShortcutKey;
  accelerator: string;
  status: ShortcutStatus;
}

const TAKEN_NOTIFICATION_TITLE = 'Shortcut unavailable';
const DUPLICATE_STATUS_DETAIL = `is already assigned to another ${PRODUCT_NAMES.desktop} shortcut`;
const TAKEN_STATUS_DETAIL = 'is already in use by another app';
const MALFORMED_STATUS_DETAIL = 'is not a valid accelerator';
function menuFallbackDetail(platform: NodeJS.Platform): string {
  return `Use the ${PRODUCT_NAMES.desktop} ${platform === 'darwin' ? 'menu bar' : 'tray menu'} instead.`;
}

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
  createNativeNotification({
    title: TAKEN_NOTIFICATION_TITLE,
    body: `${accelerator} ${detail}. ${menuFallbackDetail(process.platform)}`,
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
  if (isShortcutOff(accelerator)) {
    return { key, accelerator, status: 'off' };
  }
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
    newChatShortcut: handlers.onNewChat,
    screenshotShortcut: handlers.onScreenshot,
    windowShotShortcut: handlers.onWindowShot,
    voiceShortcut: handlers.onVoice,
    stopShortcut: handlers.onStop,
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

function lostAlwaysOnShortcut(): string | null {
  const lost = registrations.find(
    (registration) => !shortcutMayBeOff(registration.key) && registration.status !== 'registered',
  );
  if (!lost) return null;
  return `${SHORTCUT_LABELS[lost.key]} could not take that shortcut: it ${
    shortcutStatusDetail(lost.status) ?? 'was not registered'
  }. The shortcut it had is kept. Choose another one.`;
}

/**
 * Saves new chords and registers every shortcut again. A shortcut that is never
 * off has to end the change still registered: a chord another app holds is saved
 * like any other and reports `taken`, which for Stop Agents would leave no way to
 * stop an agent controlling the screen, so the previous chords are put back.
 * The settings page and the tray both change shortcuts through this. Answers what
 * to tell the person when the change was undone, otherwise null.
 */
export function changeShortcuts(
  patch: Partial<GarnishShortcuts>,
  handlers: GarnishShortcutHandlers,
): string | null {
  const previous = getShortcuts();
  saveSettings(patch);
  unregisterGarnishShortcuts();
  registerGarnishShortcuts(handlers);
  const lost = lostAlwaysOnShortcut();
  if (lost) {
    saveSettings(previous);
    unregisterGarnishShortcuts();
    registerGarnishShortcuts(handlers);
  }
  return lost;
}

export function unregisterGarnishShortcuts(): void {
  for (const registration of registrations) {
    if (registration.status === 'registered') globalShortcut.unregister(registration.accelerator);
  }
  registrations = [];
  warnedAboutConflict = false;
}

function lostAlwaysOnShortcut(): ShortcutRegistration | undefined {
  return registrations.find(
    (registration) => !shortcutMayBeOff(registration.key) && registration.status !== 'registered',
  );
}

function lostShortcutMessage(lost: ShortcutRegistration, restored: boolean): string {
  const reason = shortcutStatusDetail(lost.status) ?? 'was not registered';
  const outcome = restored
    ? 'The shortcut it had is kept.'
    : 'The shortcut it had could not be restored either.';
  return `${SHORTCUT_LABELS[lost.key]} could not take that shortcut: it ${reason}. ${outcome} Choose another one.`;
}

/**
 * A shortcut that is never off has to end a change still registered. A chord
 * another app holds is saved like any other and reports `taken`, which for
 * Stop Agents would leave no shortcut at all. Answers with what to tell the
 * person when the change did not take, after putting the old chords back.
 */
export function changeGarnishShortcuts(
  patch: Partial<GarnishShortcuts>,
  handlers: GarnishShortcutHandlers,
): string | null {
  const previous = getShortcuts();
  try {
    saveSettingsDurably(patch);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  unregisterGarnishShortcuts();
  registerGarnishShortcuts(handlers);
  const lost = lostAlwaysOnShortcut();
  if (!lost) return null;

  saveSettings(previous);
  unregisterGarnishShortcuts();
  registerGarnishShortcuts(handlers);
  return lostShortcutMessage(lost, lostAlwaysOnShortcut() === undefined);
}
