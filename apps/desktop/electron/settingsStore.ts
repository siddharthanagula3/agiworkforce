import { app } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type GarnishShortcuts, normalizeShortcuts, parseSettingsFile } from './garnishCore';

export type ShellSettings = GarnishShortcuts;

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
    cached = normalizeShortcuts(undefined);
    return cached;
  }
  cached = parseSettingsFile(contents);
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
