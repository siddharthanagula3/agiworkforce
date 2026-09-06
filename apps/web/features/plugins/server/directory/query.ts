import type { PluginRegistryStatus } from '@agiworkforce/types';
import {
  PLUGIN_DIRECTORY_DEFAULT_LIMIT,
  PLUGIN_DIRECTORY_MAX_CURSOR_CHARS,
  PLUGIN_DIRECTORY_MAX_LIMIT,
  PLUGIN_SORT_INSTALLS,
  PLUGIN_SOURCE_FACETS,
  PLUGIN_WORKS_WITH,
} from './constants';
import type {
  PluginDirectoryEntry,
  PluginDirectoryListResponse,
  PluginDirectorySort,
  PluginDirectoryStats,
  PluginSourceFacet,
  PluginWorksWith,
} from './types';

const CURSOR_PATTERN = new RegExp(`^\\d{1,${PLUGIN_DIRECTORY_MAX_CURSOR_CHARS}}$`);

export interface PluginDirectoryQuery {
  search?: string | undefined;
  verified?: boolean | undefined;
  worksWith?: PluginWorksWith | undefined;
  category?: string | undefined;
  status?: PluginRegistryStatus | undefined;
  source?: PluginSourceFacet | undefined;
  sort?: PluginDirectorySort | undefined;
  limit?: number | undefined;
  cursor?: string | null | undefined;
  offset?: number | undefined;
}

export function parseCursor(cursor: string | null | undefined): number | null {
  if (cursor === null || cursor === undefined || cursor.length === 0) return 0;
  return CURSOR_PATTERN.test(cursor) ? Number(cursor) : null;
}

export function encodeCursor(offset: number): string {
  return String(offset);
}

function zeroCounts<Key extends string>(keys: readonly Key[]): Record<Key, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<Key, number>;
}

export function computeDirectoryStats(
  entries: readonly PluginDirectoryEntry[],
): PluginDirectoryStats {
  const bySource = zeroCounts(PLUGIN_SOURCE_FACETS);
  const byWorksWith = zeroCounts(PLUGIN_WORKS_WITH);
  let verified = 0;
  for (const entry of entries) {
    if (entry.verified) verified += 1;
    bySource[entry.sourceFacet] += 1;
    for (const value of entry.worksWith) byWorksWith[value] += 1;
  }
  return { totalPlugins: entries.length, verified, bySource, byWorksWith };
}

type SearchMatcher = (entry: PluginDirectoryEntry, needle: string) => boolean;

const SEARCH_MATCHERS: readonly SearchMatcher[] = [
  (entry, needle) => entry.name.toLowerCase() === needle || entry.id === needle,
  (entry, needle) => entry.name.toLowerCase().startsWith(needle) || entry.id.startsWith(needle),
  (entry, needle) => entry.name.toLowerCase().includes(needle) || entry.slug.includes(needle),
  (entry, needle) => entry.publisher.name.toLowerCase().includes(needle),
  (entry, needle) => entry.category.toLowerCase().includes(needle),
  (entry, needle) => entry.declaredSkills.some((skill) => skill.toLowerCase().includes(needle)),
  (entry, needle) => entry.description.toLowerCase().includes(needle),
  (entry, needle) => (entry.marketplace?.name ?? '').toLowerCase().includes(needle),
];

export function searchRank(entry: PluginDirectoryEntry, needle: string): number {
  return SEARCH_MATCHERS.findIndex((matches) => matches(entry, needle));
}

function installsOf(entry: PluginDirectoryEntry): number {
  return entry.installs ?? entry.installCount ?? 0;
}

function compareByName(a: PluginDirectoryEntry, b: PluginDirectoryEntry): number {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

export function sortDirectoryEntries(
  entries: readonly PluginDirectoryEntry[],
  sort: PluginDirectorySort,
): PluginDirectoryEntry[] {
  const sorted = [...entries];
  if (sort === PLUGIN_SORT_INSTALLS) {
    sorted.sort((a, b) => installsOf(b) - installsOf(a) || compareByName(a, b));
  } else {
    sorted.sort(compareByName);
  }
  return sorted;
}

export function filterDirectoryEntries(
  entries: readonly PluginDirectoryEntry[],
  query: PluginDirectoryQuery,
): PluginDirectoryEntry[] {
  const category = query.category?.trim().toLowerCase() ?? '';
  return entries.filter((entry) => {
    if (query.verified !== undefined && entry.verified !== query.verified) return false;
    if (query.worksWith && !entry.worksWith.includes(query.worksWith)) return false;
    if (category && entry.category.toLowerCase() !== category) return false;
    if (query.status && entry.status !== query.status) return false;
    if (query.source && entry.sourceFacet !== query.source) return false;
    return true;
  });
}

export function selectDirectoryEntries(
  entries: readonly PluginDirectoryEntry[],
  query: PluginDirectoryQuery,
): PluginDirectoryEntry[] {
  const sorted = sortDirectoryEntries(
    filterDirectoryEntries(entries, query),
    query.sort ?? PLUGIN_SORT_INSTALLS,
  );
  const needle = query.search?.trim().toLowerCase() ?? '';
  if (!needle) return sorted;
  return sorted
    .map((entry, index) => ({ entry, index, rank: searchRank(entry, needle) }))
    .filter(({ rank }) => rank >= 0)
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ entry }) => entry);
}

export function queryPluginDirectory(
  entries: readonly PluginDirectoryEntry[],
  query: PluginDirectoryQuery,
): PluginDirectoryListResponse {
  const stats = computeDirectoryStats(entries);
  const selected = selectDirectoryEntries(entries, query);
  const limit = Math.min(
    PLUGIN_DIRECTORY_MAX_LIMIT,
    Math.max(1, Math.floor(query.limit ?? PLUGIN_DIRECTORY_DEFAULT_LIMIT)),
  );
  const offset = Math.max(0, Math.floor(query.offset ?? parseCursor(query.cursor) ?? 0));
  const page = selected.slice(offset, offset + limit);
  const next = offset + page.length;
  return {
    entries: page,
    total: selected.length,
    nextCursor: next < selected.length ? encodeCursor(next) : null,
    stats,
  };
}
