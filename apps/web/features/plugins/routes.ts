import {
  COMMUNITY_PLUGINS_PATH,
  MEMBER_ORGANIZATION_PLUGINS_PATH,
} from '@agiworkforce/cloud-contracts';

export const PLUGINS_API_PATH = '/api/plugins';
export const PLUGIN_INSTALLATIONS_API_PATH = `${PLUGINS_API_PATH}/installations`;
export const PLUGIN_MARKETPLACE_INSTALLATIONS_API_PATH = `${PLUGINS_API_PATH}/marketplace-installations`;
export const PLUGIN_MARKETPLACES_API_PATH = `${PLUGINS_API_PATH}/marketplaces`;

export const PLUGIN_TARGET_BUILTIN = 'builtin';
export const PLUGIN_TARGET_MARKETPLACE = 'marketplace';
export const PLUGIN_TARGET_WORKSPACE = 'workspace';
export const PLUGIN_TARGET_COMMUNITY = 'community';

export type PluginInstallationTarget =
  | { kind: typeof PLUGIN_TARGET_BUILTIN; pluginId: string }
  | { kind: typeof PLUGIN_TARGET_MARKETPLACE; installationId: string }
  | { kind: typeof PLUGIN_TARGET_WORKSPACE; pluginId: string }
  | { kind: typeof PLUGIN_TARGET_COMMUNITY; pluginId: string };

const SETTINGS_SEGMENT = 'settings';

export function pluginInstallationPath(target: PluginInstallationTarget): string {
  switch (target.kind) {
    case PLUGIN_TARGET_BUILTIN:
      return `${PLUGIN_INSTALLATIONS_API_PATH}/${encodeURIComponent(target.pluginId)}`;
    case PLUGIN_TARGET_MARKETPLACE:
      return `${PLUGIN_MARKETPLACE_INSTALLATIONS_API_PATH}/${encodeURIComponent(target.installationId)}`;
    case PLUGIN_TARGET_WORKSPACE:
      return `${MEMBER_ORGANIZATION_PLUGINS_PATH}/${encodeURIComponent(target.pluginId)}`;
    case PLUGIN_TARGET_COMMUNITY:
      return `${COMMUNITY_PLUGINS_PATH}/${encodeURIComponent(target.pluginId)}`;
  }
}

export function pluginSettingsPath(target: PluginInstallationTarget): string {
  return target.kind === PLUGIN_TARGET_BUILTIN
    ? `${PLUGINS_API_PATH}/${encodeURIComponent(target.pluginId)}/${SETTINGS_SEGMENT}`
    : `${pluginInstallationPath(target)}/${SETTINGS_SEGMENT}`;
}

export function pluginTargetKey(target: PluginInstallationTarget): string {
  return target.kind === PLUGIN_TARGET_MARKETPLACE
    ? `${PLUGIN_TARGET_MARKETPLACE}:${target.installationId}`
    : `${target.kind}:${target.pluginId}`;
}
