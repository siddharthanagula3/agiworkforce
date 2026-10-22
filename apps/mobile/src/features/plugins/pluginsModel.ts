import type {
  PluginDirectoryEntryWire,
  PluginInstallationWire,
  PluginScanWire,
  PluginUpdateOfferWire,
} from '@agiworkforce/cloud-contracts';

export const PLUGIN_FEATURED_LIMIT = 6;
export const PLUGIN_RECOMMENDED_LIMIT = 6;

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

export const PLUGIN_SCAN_NONE_COPY =
  'Not scanned. Scans run on plugins you upload or create and on registry versions.';

export const PLUGIN_CONNECTORS_NEVER_CONNECTED_NOTE =
  'Each connector stays off until you connect it yourself.';

export const PLUGIN_PERMISSIONS_COPY =
  'What this plugin says it needs. Installing it agrees to these; you can remove it at any time.';

export const PLUGIN_COMMUNITY_NOTE =
  'Built by its publisher, not by AGI Workforce. Check what it includes before you install it.';

export type PluginInstallIndex = ReadonlyMap<string, PluginInstallationWire>;

export function indexInstallations(
  installations: readonly PluginInstallationWire[],
): PluginInstallIndex {
  return new Map(installations.map((installation) => [installation.pluginId, installation]));
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

export function featuredPlugins(
  entries: readonly PluginDirectoryEntryWire[],
  installed: PluginInstallIndex,
): PluginDirectoryEntryWire[] {
  return entries
    .filter(
      (entry) =>
        entry.verified === true &&
        (entry.installs ?? 0) > 0 &&
        isPluginInstallable(entry) &&
        !installed.has(entry.id),
    )
    .sort(byInstallsThenName)
    .slice(0, PLUGIN_FEATURED_LIMIT);
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

export function pluginCategories(
  entries: readonly PluginDirectoryEntryWire[],
  byCategory?: Record<string, number>,
): string[] {
  const names = new Set<string>(Object.keys(byCategory ?? {}));
  for (const entry of entries) names.add(entry.category);
  return [...names].filter((name) => name.trim().length > 0).sort((a, b) => a.localeCompare(b));
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

export function versionSwitchSummary(offer: PluginUpdateOfferWire): string {
  const parts = [`Moves from ${offer.installedVersion} to ${offer.latestVersion}.`];
  if (offer.diff.addedPermissions.length > 0) {
    parts.push(`It also asks for: ${offer.diff.addedPermissions.join(', ')}.`);
  }
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
