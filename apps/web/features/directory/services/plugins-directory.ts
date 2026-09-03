import type {
  PluginMarketplaceEntry,
  PluginMarketplaceSourceSummary,
} from '@agiworkforce/cloud-contracts';
import type { PluginRegistryEntry } from '@agiworkforce/types';
import type {
  DirectoryEntry,
  DirectoryFilterGroup,
  DirectoryPluginDetail,
  DirectorySection,
  DirectorySourceChip,
} from '@agiworkforce/ui';

import {
  DIRECTORY_PAGE_SIZE,
  DIRECTORY_SOURCE_AGI,
  DIRECTORY_SOURCE_LABEL_AGI,
  DIRECTORY_SOURCE_LABEL_PARTNERS,
  DIRECTORY_SOURCE_PARTNERS,
  MS_PER_DAY,
  NEW_ENTRY_WINDOW_DAYS,
  PLUGINS_PATH,
  PLUGIN_INSTALLATIONS_PATH,
  PLUGIN_MARKETPLACES_PATH,
  PLUGIN_MARKETPLACE_ENTRIES_PATH,
  PLUGIN_MARKETPLACE_INSTALLATIONS_PATH,
  PLUGIN_STATUS_GROUP_ID,
  PLUGIN_STATUS_GROUP_LABEL,
  PLUGIN_STATUS_INSTALLED,
  PLUGIN_STATUS_INSTALLED_LABEL,
  PLUGIN_STATUS_NOT_INSTALLED,
  PLUGIN_STATUS_NOT_INSTALLED_LABEL,
} from '../constants';

export interface PluginDirectorySnapshot {
  registry: PluginRegistryEntry[];
  marketplaceEntries: PluginMarketplaceEntry[];
  marketplaceSources: PluginMarketplaceSourceSummary[];
  installedPluginIds: Set<string>;
  installedEntryIds: Set<string>;
}

export function isRecentlyAdded(createdAt: string | undefined, now: number): boolean {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return now - created <= NEW_ENTRY_WINDOW_DAYS * MS_PER_DAY;
}

function statusFacet(installed: boolean): readonly string[] {
  return [installed ? PLUGIN_STATUS_INSTALLED : PLUGIN_STATUS_NOT_INSTALLED];
}

export function toRegistryEntry(
  plugin: PluginRegistryEntry,
  installedPluginIds: ReadonlySet<string>,
  now: number,
): DirectoryEntry {
  const installed = installedPluginIds.has(plugin.id);
  const firstParty = plugin.publisher.kind === 'first-party';
  return {
    id: plugin.id,
    name: plugin.name,
    publisher: plugin.publisher.name,
    description: plugin.description,
    monogram: plugin.name.slice(0, 1).toUpperCase(),
    badges: [firstParty ? 'agi' : 'partner'],
    sourceId: firstParty ? DIRECTORY_SOURCE_AGI : DIRECTORY_SOURCE_PARTNERS,
    installed,
    isNew: isRecentlyAdded(plugin.createdAt, now),
    updatedAt: plugin.updatedAt,
    ...(plugin.installCount === undefined ? {} : { installCount: plugin.installCount }),
    facets: { [PLUGIN_STATUS_GROUP_ID]: statusFacet(installed) },
  };
}

export function toMarketplaceDirectoryEntry(
  entry: PluginMarketplaceEntry,
  installedEntryIds: ReadonlySet<string>,
  now: number,
): DirectoryEntry {
  const installed = installedEntryIds.has(entry.id);
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    monogram: entry.name.slice(0, 1).toUpperCase(),
    sourceId: entry.sourceId,
    installed,
    isNew: isRecentlyAdded(entry.createdAt, now),
    updatedAt: entry.updatedAt,
    facets: { [PLUGIN_STATUS_GROUP_ID]: statusFacet(installed) },
  };
}

function pluginSources(
  entries: readonly DirectoryEntry[],
  sources: readonly PluginMarketplaceSourceSummary[],
): DirectorySourceChip[] {
  const present = new Set(entries.map((entry) => entry.sourceId));
  const chips: DirectorySourceChip[] = [];
  if (present.has(DIRECTORY_SOURCE_AGI))
    chips.push({ id: DIRECTORY_SOURCE_AGI, label: DIRECTORY_SOURCE_LABEL_AGI });
  if (present.has(DIRECTORY_SOURCE_PARTNERS))
    chips.push({ id: DIRECTORY_SOURCE_PARTNERS, label: DIRECTORY_SOURCE_LABEL_PARTNERS });
  for (const source of sources) {
    chips.push({ id: source.id, label: source.name, removable: true });
  }
  return chips;
}

function pluginFilterGroups(entries: readonly DirectoryEntry[]): DirectoryFilterGroup[] {
  const installed = entries.some((entry) => entry.installed === true);
  const notInstalled = entries.some((entry) => entry.installed !== true);
  if (!installed || !notInstalled) return [];
  return [
    {
      id: PLUGIN_STATUS_GROUP_ID,
      label: PLUGIN_STATUS_GROUP_LABEL,
      options: [
        { value: PLUGIN_STATUS_INSTALLED, label: PLUGIN_STATUS_INSTALLED_LABEL },
        { value: PLUGIN_STATUS_NOT_INSTALLED, label: PLUGIN_STATUS_NOT_INSTALLED_LABEL },
      ],
    },
  ];
}

export function toPluginSection(snapshot: PluginDirectorySnapshot, now: number): DirectorySection {
  const entries = [
    ...snapshot.registry.map((plugin) => toRegistryEntry(plugin, snapshot.installedPluginIds, now)),
    ...snapshot.marketplaceEntries.map((entry) =>
      toMarketplaceDirectoryEntry(entry, snapshot.installedEntryIds, now),
    ),
  ];
  const hasCounts = entries.some((entry) => entry.installCount !== undefined);
  return {
    entries,
    sources: pluginSources(entries, snapshot.marketplaceSources),
    filterGroups: pluginFilterGroups(entries),
    sortOptions: hasCounts ? ['popular', 'updated', 'name'] : ['updated', 'name'],
  };
}

export function toRegistryDetail(
  plugin: PluginRegistryEntry,
  installedPluginIds: ReadonlySet<string>,
): DirectoryPluginDetail {
  return {
    kind: 'plugin',
    id: plugin.id,
    name: plugin.name,
    publisher: plugin.publisher.name,
    description: plugin.description,
    sourceUrl: plugin.homepageUrl ?? plugin.publisher.url ?? null,
    examplePrompts: plugin.examplePrompts,
    installed: installedPluginIds.has(plugin.id),
    installable: plugin.webInstallable,
  };
}

export function toMarketplaceDetail(
  entry: PluginMarketplaceEntry,
  source: PluginMarketplaceSourceSummary | undefined,
  installedEntryIds: ReadonlySet<string>,
): DirectoryPluginDetail {
  return {
    kind: 'plugin',
    id: entry.id,
    name: entry.name,
    ...(source ? { publisher: source.name } : {}),
    description: entry.description,
    sourceUrl: source?.repositoryUrl ?? null,
    examplePrompts: entry.examplePrompts,
    installed: installedEntryIds.has(entry.id),
    installable: true,
  };
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) return fallback;
  return (await response.json()) as T;
}

export async function fetchPluginSnapshot(): Promise<PluginDirectorySnapshot> {
  const registryResponse = await fetch(`${PLUGINS_PATH}?limit=${DIRECTORY_PAGE_SIZE}`, {
    cache: 'no-store',
  });
  if (!registryResponse.ok) throw new Error(`plugin catalog failed: ${registryResponse.status}`);
  const registry = ((await registryResponse.json()) as { entries?: PluginRegistryEntry[] }).entries;

  const installations = await readJson<{
    installations?: { pluginId: string; enabled: boolean }[];
  }>(PLUGIN_INSTALLATIONS_PATH, {});
  const marketplaceEntries = await readJson<{ entries?: PluginMarketplaceEntry[] }>(
    PLUGIN_MARKETPLACE_ENTRIES_PATH,
    {},
  );
  const marketplaceSources = await readJson<{ sources?: PluginMarketplaceSourceSummary[] }>(
    PLUGIN_MARKETPLACES_PATH,
    {},
  );
  const marketplaceInstallations = await readJson<{ installations?: { entryId: string }[] }>(
    PLUGIN_MARKETPLACE_INSTALLATIONS_PATH,
    {},
  );

  return {
    registry: registry ?? [],
    marketplaceEntries: marketplaceEntries.entries ?? [],
    marketplaceSources: marketplaceSources.sources ?? [],
    installedPluginIds: new Set(
      (installations.installations ?? []).map((installation) => installation.pluginId),
    ),
    installedEntryIds: new Set(
      (marketplaceInstallations.installations ?? []).map((installation) => installation.entryId),
    ),
  };
}
