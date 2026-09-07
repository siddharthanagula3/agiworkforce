import type {
  PluginInstallationSettings,
  PluginInstallationSettingsPatch,
} from '@agiworkforce/cloud-contracts';

import {
  pluginInstallationPath,
  pluginSettingsPath,
  type PluginInstallationTarget,
} from '../routes';

export const PLUGIN_SETTINGS_LOAD_FAILED_COPY = 'Could not read this plugin settings. Try again.';
export const PLUGIN_SETTINGS_SAVE_FAILED_COPY = 'Could not save this plugin settings. Try again.';
export const PLUGIN_ENABLE_FAILED_COPY = 'Could not change this plugin. Try again.';
export const PLUGIN_NOT_INSTALLED_COPY = 'This plugin is not installed on your account.';

const JSON_CONTENT_TYPE = 'application/json';
const CSRF_HEADER = 'x-csrf-token';
const NOT_FOUND_STATUS = 404;
const SPOKEN_STATUSES: readonly number[] = [404, 409, 502, 503];

export class PluginSettingsError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'PluginSettingsError';
    this.status = status;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

async function messageFor(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as ErrorBody;
  const message = body.error?.message;
  return SPOKEN_STATUSES.includes(response.status) && message ? message : fallback;
}

export async function fetchPluginSettings(
  target: PluginInstallationTarget,
): Promise<PluginInstallationSettings> {
  const response = await fetch(pluginSettingsPath(target), { cache: 'no-store' });
  if (!response.ok) {
    throw new PluginSettingsError(
      response.status,
      await messageFor(
        response,
        response.status === NOT_FOUND_STATUS
          ? PLUGIN_NOT_INSTALLED_COPY
          : PLUGIN_SETTINGS_LOAD_FAILED_COPY,
      ),
    );
  }
  const body = (await response.json()) as { settings: PluginInstallationSettings };
  return body.settings;
}

export async function updatePluginSettings(
  target: PluginInstallationTarget,
  patch: PluginInstallationSettingsPatch,
  csrfToken: string,
): Promise<PluginInstallationSettings> {
  const response = await fetch(pluginSettingsPath(target), {
    method: 'PATCH',
    headers: { 'Content-Type': JSON_CONTENT_TYPE, [CSRF_HEADER]: csrfToken },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    throw new PluginSettingsError(
      response.status,
      await messageFor(response, PLUGIN_SETTINGS_SAVE_FAILED_COPY),
    );
  }
  const body = (await response.json()) as { settings: PluginInstallationSettings };
  return body.settings;
}

export async function setPluginInstallationEnabled(
  target: PluginInstallationTarget,
  enabled: boolean,
  csrfToken: string,
): Promise<boolean> {
  const response = await fetch(pluginInstallationPath(target), {
    method: 'PATCH',
    headers: { 'Content-Type': JSON_CONTENT_TYPE, [CSRF_HEADER]: csrfToken },
    body: JSON.stringify({ enabled }),
  });
  if (!response.ok) {
    throw new PluginSettingsError(
      response.status,
      await messageFor(response, PLUGIN_ENABLE_FAILED_COPY),
    );
  }
  const body = (await response.json()) as { installation?: { enabled?: boolean } };
  return body.installation?.enabled ?? enabled;
}
