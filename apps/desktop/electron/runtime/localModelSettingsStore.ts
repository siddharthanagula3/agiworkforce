import { app } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  LOCAL_MODEL_SERVERS,
  normalizeLocalBaseUrl,
  normalizeLocalModelSettings,
  type LocalModelServerId,
  type LocalModelSettings,
} from '@agiworkforce/local-runtime-contract';
import { OLLAMA_DEFAULT_BASE_URL } from '@agiworkforce/providers-ollama';
import { LMSTUDIO_DEFAULT_BASE_URL } from '@agiworkforce/providers-lmstudio';

export const LOCAL_MODEL_DEFAULT_BASE_URLS: Record<LocalModelServerId, string> = {
  ollama: OLLAMA_DEFAULT_BASE_URL,
  lmstudio: LMSTUDIO_DEFAULT_BASE_URL,
};

let settings: LocalModelSettings = normalizeLocalModelSettings(
  undefined,
  LOCAL_MODEL_DEFAULT_BASE_URLS,
);
let loaded = false;

function storePath(): string {
  return path.join(app.getPath('userData'), 'desktop-local-models.json');
}

function load(): void {
  if (loaded) return;
  loaded = true;
  let raw: string;
  try {
    raw = readFileSync(storePath(), 'utf8');
  } catch {
    return;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    settings = normalizeLocalModelSettings(
      parsed as Partial<LocalModelSettings>,
      LOCAL_MODEL_DEFAULT_BASE_URLS,
    );
  } catch {
    settings = normalizeLocalModelSettings(undefined, LOCAL_MODEL_DEFAULT_BASE_URLS);
  }
}

export function readLocalModelSettings(): LocalModelSettings {
  load();
  return { baseUrls: { ...settings.baseUrls } };
}

export function readLocalBaseUrl(serverId: LocalModelServerId): string {
  return readLocalModelSettings().baseUrls[serverId];
}

export function writeLocalModelSettings(next: Partial<LocalModelSettings>): LocalModelSettings {
  load();
  const baseUrls = { ...settings.baseUrls };
  for (const serverId of LOCAL_MODEL_SERVERS) {
    const candidate = next.baseUrls?.[serverId];
    if (typeof candidate !== 'string') continue;
    baseUrls[serverId] = normalizeLocalBaseUrl(candidate, LOCAL_MODEL_DEFAULT_BASE_URLS[serverId]);
  }
  settings = { baseUrls };
  try {
    writeFileSync(storePath(), `${JSON.stringify(settings, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch (error) {
    console.warn('[local-models] could not persist the server settings:', error);
  }
  return readLocalModelSettings();
}
