import { app } from 'electron';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  type GarnishPreferences,
  type GarnishShortcuts,
  normalizePreferences,
  normalizeShortcuts,
  parsePreferencesFile,
  parseSettingsFile,
} from './garnishCore';

export type ShellSettings = GarnishShortcuts & GarnishPreferences;

let cached: ShellSettings | null = null;

export function settingsFilePath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function getSettings(): ShellSettings {
  if (cached) return cached;
  let contents: string;
  try {
    contents = readFileSync(settingsFilePath(), 'utf8');
  } catch {
    cached = { ...normalizeShortcuts(undefined), ...normalizePreferences(undefined) };
    return cached;
  }
  cached = { ...parseSettingsFile(contents), ...parsePreferencesFile(contents) };
  return cached;
}

export function getShortcuts(): GarnishShortcuts {
  const settings = getSettings();
  return {
    quickAskShortcut: settings.quickAskShortcut,
    newChatShortcut: settings.newChatShortcut,
    screenshotShortcut: settings.screenshotShortcut,
    windowShotShortcut: settings.windowShotShortcut,
    voiceShortcut: settings.voiceShortcut,
    stopShortcut: settings.stopShortcut,
  };
}

export function getPreferences(): GarnishPreferences {
  return normalizePreferences(getSettings());
}

function mergeSettings(patch: Partial<ShellSettings>): ShellSettings {
  const next = { ...getSettings(), ...patch };
  return { ...normalizeShortcuts(next), ...normalizePreferences(next) };
}

function writeSettingsFile(settings: ShellSettings): void {
  const file = settingsFilePath();
  const staged = `${file}.tmp`;
  writeFileSync(staged, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  renameSync(staged, file);
}

export function saveSettingsDurably(patch: Partial<ShellSettings>): ShellSettings {
  const merged = mergeSettings(patch);
  try {
    writeSettingsFile(merged);
  } catch (error) {
    console.warn('[settings] could not persist settings.json:', error);
    throw new Error('The setting could not be saved on this computer, so it was not changed.', {
      cause: error,
    });
  }
  cached = merged;
  return merged;
}

export function saveSettings(patch: Partial<ShellSettings>): ShellSettings {
  const merged = mergeSettings(patch);
  cached = merged;
  try {
    writeSettingsFile(merged);
  } catch (error) {
    console.warn('[settings] could not persist settings.json:', error);
  }
  return merged;
}
