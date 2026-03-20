/**
 * Shortcuts API — typed wrappers for shortcuts_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface Shortcut {
  id: string;
  key: string;
  description: string;
  action: string;
  enabled: boolean;
  isGlobal: boolean;
}

export interface QuickQueryHotkeyPreferences {
  enabled: boolean;
  combo: string;
}

// ---- Commands ----

export async function shortcutsRegister(shortcut: Shortcut): Promise<void> {
  return command<void>('shortcuts_register', { shortcut });
}

export async function shortcutsUnregister(shortcutId: string): Promise<void> {
  return command<void>('shortcuts_unregister', { shortcutId });
}

export async function shortcutsList(): Promise<Shortcut[]> {
  return command<Shortcut[]>('shortcuts_list');
}

export async function shortcutsUpdate(
  shortcutId: string,
  newKey?: string,
  enabled?: boolean,
): Promise<Shortcut> {
  return command<Shortcut>('shortcuts_update', { shortcutId, newKey, enabled });
}

export async function shortcutsTrigger(action: string): Promise<void> {
  return command<void>('shortcuts_trigger', { action });
}

export async function shortcutsReset(): Promise<Shortcut[]> {
  return command<Shortcut[]>('shortcuts_reset');
}

export async function shortcutsCheckKey(key: string): Promise<boolean> {
  return command<boolean>('shortcuts_check_key', { key });
}

export async function shortcutsGetDefaults(): Promise<Shortcut[]> {
  return command<Shortcut[]>('shortcuts_get_defaults');
}

export async function shortcutsApplyQuickQueryPreferences(
  preferences: QuickQueryHotkeyPreferences,
): Promise<Shortcut> {
  return command<Shortcut>('shortcuts_apply_quick_query_preferences', { preferences });
}

export async function shortcutsRegisterGlobal(key: string, action: string): Promise<void> {
  return command<void>('shortcuts_register_global', { key, action });
}

export async function shortcutsUnregisterGlobal(key: string): Promise<void> {
  return command<void>('shortcuts_unregister_global', { key });
}
