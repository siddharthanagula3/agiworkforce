import type {
  PluginDirectoryEntryWire,
  PluginInstallationWire,
  PluginScanWire,
  PluginUpdateOfferWire,
} from '@agiworkforce/cloud-contracts';

export const PLUGIN_POPULAR_LIMIT = 6;
export const PLUGIN_RECOMMENDED_LIMIT = 6;
export const PLUGIN_INSTALLED_TILE_LIMIT = 5;
export const PLUGIN_SHELF_COUNT = 3;
export const PLUGIN_SHELF_MIN_ENTRIES = 3;
export const PLUGIN_SHELF_ROW_LIMIT = 4;
export const PLUGIN_DETAIL_CONCURRENCY = 6;
export const ADDED_PLUGINS_ROUTE = '/(app)/plugins/installed';

export const PLUGIN_WORKS_WITH_LABELS: Readonly<Record<string, string>> = {
  web: 'Web',
  'claude-code': 'CLI',
  cowork: 'Cowork',
};

export const PLUGIN_SCAN_VERDICT_COPY: Readonly<
  Record<NonNullable<PluginScanWire['scan']>['verdict'], string>
> = {
  pass: 'Passed. No unsafe patterns were found.',
  review: 'Needs your review. It may carry risk depending on where it came from.',
  block: 'Blocked. It cannot be installed.',
};

export const PLUGIN_SCAN_NONE_COPY = 'Not scanned.';

export const PLUGIN_CONNECTORS_NEVER_CONNECTED_NOTE =
  'Each connector stays off until you connect it yourself.';

export const PLUGIN_PERMISSIONS_COPY =
  'What this plugin says it needs. Installing it agrees to these; you can remove it at any time.';

export const PLUGIN_COMMUNITY_NOTE =
  'Built by its publisher, not AGI Workforce. Check it before installing.';

export type PluginInstallIndex = ReadonlyMap<string, PluginInstallationWire>;

export function indexInstallations(
  installations: readonly PluginInstallationWire[],
): PluginInstallIndex {
  return new Map(installations.map((installation) => [installation.pluginId, installation]));
}

export type InstalledPluginDetail =
  { status: 'loaded'; entry: PluginDirectoryEntryWire } | { status: 'failed' };

function installedAtMillis(installation: PluginInstallationWire): number {
  const millis = Date.parse(installation.installedAt);
  return Number.isNaN(millis) ? 0 : millis;
}

export function installedTilePlan(
  installations: readonly PluginInstallationWire[],
  limit: number = PLUGIN_INSTALLED_TILE_LIMIT,
): { tiles: PluginInstallationWire[]; overflow: number } {
  const recent = [...installations].sort(
    (left, right) =>
      installedAtMillis(right) - installedAtMillis(left) ||
      left.pluginId.localeCompare(right.pluginId),
  );
  return { tiles: recent.slice(0, limit), overflow: Math.max(0, recent.length - limit) };
}

export function pluginTileLetter(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?';
}

export interface AddedPluginRow {
  id: string;
  name: string;
  meta: string | null;
}

export const PLUGIN_ADDED_FAILED_META = 'Could not load';

export function addedPluginRows(
  installations: readonly PluginInstallationWire[],
  details: ReadonlyMap<string, InstalledPluginDetail>,
  search = '',
): AddedPluginRow[] {
  const needle = search.trim().toLowerCase();
  return installations
    .map((installation): AddedPluginRow => {
      const detail = details.get(installation.pluginId);
      const loaded = detail?.status === 'loaded' ? detail.entry : null;
      return {
        id: installation.pluginId,
        name: loaded?.name ?? installation.pluginId,
        meta: loaded ? (installation.enabled ? null : 'Turned off') : PLUGIN_ADDED_FAILED_META,
      };
    })
    .filter((row) => !needle || row.name.toLowerCase().includes(needle))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) ||
        left.id.localeCompare(right.id),
    );
}

export function addedPluginsCountLabel(count: number): string | null {
  return count > 0 ? `${count} added` : null;
}

export function isPluginInstallable(entry: PluginDirectoryEntryWire): boolean {
  return entry.status === 'published' && entry.webInstallable;
}

export interface PluginCompatibility {
  installable: boolean;
  warning: string | null;
}

export function pluginCompatibility(entry: PluginDirectoryEntryWire): PluginCompatibility {
  if (entry.status !== 'published') {
    return { installable: false, warning: 'Coming later. This plugin is not published yet.' };
  }
  if (!entry.webInstallable) {
    return {
      installable: false,
      warning:
        entry.runtime?.note ??
        'Runs in the Desktop app and the CLI. Cloud chats on this phone cannot load it.',
    };
  }
  return { installable: true, warning: entry.runtime?.note ?? null };
}

function byInstallsThenName(left: PluginDirectoryEntryWire, right: PluginDirectoryEntryWire) {
  return (right.installs ?? 0) - (left.installs ?? 0) || left.name.localeCompare(right.name);
}

export function popularPlugins(
  entries: readonly PluginDirectoryEntryWire[],
): PluginDirectoryEntryWire[] {
  return entries
    .filter(
      (entry) => entry.verified === true && (entry.installs ?? 0) > 0 && isPluginInstallable(entry),
    )
    .sort(byInstallsThenName)
    .slice(0, PLUGIN_POPULAR_LIMIT);
}

export type PluginRowControl = 'install' | 'more' | 'none';

export function pluginRowControl(
  entry: PluginDirectoryEntryWire,
  installation: PluginInstallationWire | undefined,
): PluginRowControl {
  if (installation) return 'more';
  return isPluginInstallable(entry) ? 'install' : 'none';
}

export function pluginInstallPermissionsMessage(permissions: readonly string[]): string {
  return `${PLUGIN_PERMISSIONS_COPY}\n\n${permissions.map((permission) => `• ${permission}`).join('\n')}`;
}

export function recommendedPlugins(
  entries: readonly PluginDirectoryEntryWire[],
  installed: PluginInstallIndex,
  connectedConnectorIds: ReadonlySet<string>,
  exclude: ReadonlySet<string>,
): PluginDirectoryEntryWire[] {
  return entries
    .filter(
      (entry) =>
        isPluginInstallable(entry) &&
        !installed.has(entry.id) &&
        !exclude.has(entry.id) &&
        entry.requiredConnectors.some((connector) => connectedConnectorIds.has(connector)),
    )
    .sort(byInstallsThenName)
    .slice(0, PLUGIN_RECOMMENDED_LIMIT);
}

export interface PluginCategoryOption {
  key: string;
  value: string;
  label: string;
}

export function pluginCategoryKey(category: string): string {
  return category.trim().toLowerCase();
}

export function pluginCategoryLabel(category: string): string {
  const words = category.trim().replace(/[-_]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function pluginCategories(
  entries: readonly PluginDirectoryEntryWire[],
  byCategory?: Record<string, number>,
): PluginCategoryOption[] {
  const options = new Map<string, PluginCategoryOption>();
  const add = (category: string) => {
    const key = pluginCategoryKey(category);
    if (!key || options.has(key)) return;
    options.set(key, { key, value: category.trim(), label: pluginCategoryLabel(key) });
  };
  for (const entry of entries) add(entry.category);
  for (const name of Object.keys(byCategory ?? {})) add(name);
  return [...options.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function pluginShelfCategories(
  byCategory: Record<string, number> | undefined,
): PluginCategoryOption[] {
  return Object.entries(byCategory ?? {})
    .filter(([name, count]) => pluginCategoryKey(name) && count >= PLUGIN_SHELF_MIN_ENTRIES)
    .sort(
      ([leftName, leftCount], [rightName, rightCount]) =>
        rightCount - leftCount ||
        pluginCategoryLabel(leftName).localeCompare(pluginCategoryLabel(rightName)),
    )
    .slice(0, PLUGIN_SHELF_COUNT)
    .map(([name]) => ({
      key: pluginCategoryKey(name),
      value: name.trim(),
      label: pluginCategoryLabel(name),
    }));
}

export function pluginStateLabel(
  entry: PluginDirectoryEntryWire,
  installation: PluginInstallationWire | undefined,
): string {
  if (installation) return installation.enabled ? 'Installed' : 'Turned off';
  if (entry.status !== 'published') return 'Coming later';
  if (!entry.webInstallable) return 'Desktop and CLI';
  return 'Install';
}

export function pluginWorksWith(entry: PluginDirectoryEntryWire): string[] {
  return (entry.worksWith ?? []).map((value) => PLUGIN_WORKS_WITH_LABELS[value] ?? value);
}

export interface PluginIncludes {
  skills: string[];
  agents: string[];
  commands: number;
  mcpServers: string[];
  hooks: boolean;
}

export function pluginIncludes(entry: PluginDirectoryEntryWire): PluginIncludes {
  const components = entry.runtime?.components;
  const skills = new Set([...entry.declaredSkills, ...(components?.skills ?? [])]);
  return {
    skills: [...skills],
    agents: components?.agents ?? [],
    commands: components?.commands ?? 0,
    mcpServers: (components?.mcpServers ?? []).map((server) => server.name),
    hooks: components?.hooks ?? false,
  };
}

export function updateOfferFor(
  updates: readonly PluginUpdateOfferWire[],
  pluginId: string,
): PluginUpdateOfferWire | undefined {
  return updates.find((update) => update.pluginId === pluginId);
}

export function versionMoveSummary(
  installedVersion: string,
  targetVersion: string,
  permissions: readonly string[],
): string {
  const parts = [`Moves from ${installedVersion} to ${targetVersion}.`];
  if (permissions.length > 0) {
    parts.push(`It also asks for: ${permissions.join(', ')}.`);
  }
  return parts.join(' ');
}

export function versionSwitchSummary(
  offer: PluginUpdateOfferWire,
  permissions: readonly string[] = offer.diff.addedPermissions,
): string {
  const parts = [versionMoveSummary(offer.installedVersion, offer.latestVersion, permissions)];
  if (offer.diff.addedSkills.length > 0) {
    parts.push(`It adds these skills: ${offer.diff.addedSkills.join(', ')}.`);
  }
  if (offer.diff.removedSkills.length > 0) {
    parts.push(`It removes these skills: ${offer.diff.removedSkills.join(', ')}.`);
  }
  return parts.join(' ');
}

export const PLUGIN_REPAIR_MISSING_SKILLS_COPY = 'These skills did not load:';

export function missingPluginSkills(
  enabledSkills: readonly string[],
  loadedSkillNames: ReadonlySet<string> | null,
): string[] {
  if (!loadedSkillNames) return [];
  return enabledSkills.filter((name) => !loadedSkillNames.has(name));
}
