/**
 * Persisted shell settings (plain JSON in the Electron userData dir).
 *
 * Deliberately not `electron-store` or any other dependency: the only thing
 * the shell needs to persist today is two global-shortcut accelerators, and
 * the cloud shell keeps its dependency surface minimal. User-scoped product
 * state lives in the cloud account, not here.
 */
import { app } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type GarnishShortcuts, normalizeShortcuts, parseSettingsFile } from './garnishCore';

export type ShellSettings = GarnishShortcuts;

let cached: ShellSettings | null = null;

export function settingsFilePath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

/**
 * Read settings from disk, tolerating every failure mode (missing file,
 * unreadable file, invalid JSON, wrong shape) by falling back to defaults.
 * Cached after the first read; the file is only written by `saveSettings`.
 */
export function getSettings(): ShellSettings {
  if (cached) return cached;
  let contents: string;
  try {
    contents = readFileSync(settingsFilePath(), 'utf8');
  } catch {
    // No settings yet (first run) or unreadable — defaults are correct here.
    cached = normalizeShortcuts(undefined);
    return cached;
  }
  cached = parseSettingsFile(contents);
  return cached;
}

/** The accelerators to register, with defaults already applied. */
export function getShortcuts(): GarnishShortcuts {
  const settings = getSettings();
  return {
    quickAskShortcut: settings.quickAskShortcut,
    screenshotShortcut: settings.screenshotShortcut,
  };
}

/**
 * Persist a partial update. Returns the merged settings. Write failures are
 * swallowed on purpose — an unwritable userData dir must not break the app,
 * and the in-memory value stays correct for this session.
 */
export function saveSettings(patch: Partial<ShellSettings>): ShellSettings {
  const merged = normalizeShortcuts({ ...getSettings(), ...patch });
  cached = merged;
  try {
    writeFileSync(settingsFilePath(), `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  } catch (error) {
    console.warn('[settings] could not persist settings.json:', error);
  }
  return merged;
}
