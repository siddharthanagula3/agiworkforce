import { app } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
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
    screenshotShortcut: settings.screenshotShortcut,
    voiceShortcut: settings.voiceShortcut,
  };
}

export function getPreferences(): GarnishPreferences {
  return normalizePreferences(getSettings());
}

export function saveSettings(patch: Partial<ShellSettings>): ShellSettings {
  const next = { ...getSettings(), ...patch };
  const merged: ShellSettings = { ...normalizeShortcuts(next), ...normalizePreferences(next) };
  cached = merged;
  try {
    writeFileSync(settingsFilePath(), `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  } catch (error) {
    console.warn('[settings] could not persist settings.json:', error);
  }
  return merged;
}
