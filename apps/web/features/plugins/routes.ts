export const PLUGINS_API_PATH = '/api/plugins';
export const PLUGIN_INSTALLATIONS_API_PATH = `${PLUGINS_API_PATH}/installations`;
export const PLUGIN_MARKETPLACE_INSTALLATIONS_API_PATH = `${PLUGINS_API_PATH}/marketplace-installations`;
export const PLUGIN_MARKETPLACES_API_PATH = `${PLUGINS_API_PATH}/marketplaces`;

export const PLUGIN_TARGET_BUILTIN = 'builtin';
export const PLUGIN_TARGET_MARKETPLACE = 'marketplace';

export type PluginInstallationTarget =
  | { kind: typeof PLUGIN_TARGET_BUILTIN; pluginId: string }
  | { kind: typeof PLUGIN_TARGET_MARKETPLACE; installationId: string };

const SETTINGS_SEGMENT = 'settings';

export function pluginInstallationPath(target: PluginInstallationTarget): string {
  return target.kind === PLUGIN_TARGET_BUILTIN
    ? `${PLUGIN_INSTALLATIONS_API_PATH}/${encodeURIComponent(target.pluginId)}`
    : `${PLUGIN_MARKETPLACE_INSTALLATIONS_API_PATH}/${encodeURIComponent(target.installationId)}`;
}

export function pluginSettingsPath(target: PluginInstallationTarget): string {
  return target.kind === PLUGIN_TARGET_BUILTIN
    ? `${PLUGINS_API_PATH}/${encodeURIComponent(target.pluginId)}/${SETTINGS_SEGMENT}`
    : `${pluginInstallationPath(target)}/${SETTINGS_SEGMENT}`;
}

export function pluginTargetKey(target: PluginInstallationTarget): string {
  return target.kind === PLUGIN_TARGET_BUILTIN
    ? `${PLUGIN_TARGET_BUILTIN}:${target.pluginId}`
    : `${PLUGIN_TARGET_MARKETPLACE}:${target.installationId}`;
}
