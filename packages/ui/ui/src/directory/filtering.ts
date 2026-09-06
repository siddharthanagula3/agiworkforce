import { COUNT_PRECISION, INSTALL_COUNT_FLOOR, MILLION, THOUSAND } from './constants';
import type {
  DirectoryDetailFile,
  DirectoryEntry,
  DirectoryFilterSelection,
  DirectorySortKey,
} from './types';

export function matchesDirectorySearch(entry: DirectoryEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [entry.name, entry.publisher ?? '', entry.description].join(' ').toLowerCase();
  return haystack.includes(needle);
}

export function matchesDirectoryFilters(
  entry: DirectoryEntry,
  selection: DirectoryFilterSelection,
): boolean {
  return Object.entries(selection).every(([groupId, values]) => {
    if (values.length === 0) return true;
    const facet = entry.facets?.[groupId] ?? [];
    return values.some((value) => facet.includes(value));
  });
}

export function matchesDirectorySource(entry: DirectoryEntry, sourceId: string | null): boolean {
  if (!sourceId) return true;
  return entry.sourceId === sourceId;
}

function compareByName(a: DirectoryEntry, b: DirectoryEntry): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function compareByUpdated(a: DirectoryEntry, b: DirectoryEntry): number {
  const left = a.updatedAt ? Date.parse(a.updatedAt) : Number.NaN;
  const right = b.updatedAt ? Date.parse(b.updatedAt) : Number.NaN;
  if (Number.isNaN(left) && Number.isNaN(right)) return compareByName(a, b);
  if (Number.isNaN(left)) return 1;
  if (Number.isNaN(right)) return -1;
  if (left === right) return compareByName(a, b);
  return right - left;
}

function compareByPopularity(a: DirectoryEntry, b: DirectoryEntry): number {
  const left = a.installCount ?? -1;
  const right = b.installCount ?? -1;
  if (left === right) return compareByName(a, b);
  return right - left;
}

export function sortDirectoryEntries(
  entries: readonly DirectoryEntry[],
  sort: DirectorySortKey,
): DirectoryEntry[] {
  const copy = [...entries];
  if (sort === 'name') return copy.sort(compareByName);
  if (sort === 'updated') return copy.sort(compareByUpdated);
  return copy.sort(compareByPopularity);
}

export function selectDirectoryEntries({
  entries,
  query,
  selection,
  sourceId,
  sort,
}: {
  entries: readonly DirectoryEntry[];
  query: string;
  selection: DirectoryFilterSelection;
  sourceId: string | null;
  sort: DirectorySortKey;
}): DirectoryEntry[] {
  const filtered = entries.filter(
    (entry) =>
      matchesDirectorySearch(entry, query) &&
      matchesDirectoryFilters(entry, selection) &&
      matchesDirectorySource(entry, sourceId),
  );
  return sortDirectoryEntries(filtered, sort);
}

export function toggleFilterValue(
  selection: DirectoryFilterSelection,
  groupId: string,
  value: string,
  exclusive = false,
): DirectoryFilterSelection {
  const current = selection[groupId] ?? [];
  const selected = current.includes(value);
  const next = selected
    ? current.filter((item) => item !== value)
    : exclusive
      ? [value]
      : [...current, value];
  const merged: Record<string, readonly string[]> = { ...selection, [groupId]: next };
  if (next.length === 0) delete merged[groupId];
  return merged;
}

export function countActiveFilters(selection: DirectoryFilterSelection): number {
  return Object.values(selection).reduce((total, values) => total + values.length, 0);
}

export function formatInstallCount(count: number | undefined): string | null {
  if (count === undefined || !Number.isFinite(count) || count < INSTALL_COUNT_FLOOR) return null;
  if (count >= MILLION) return `${trimZero((count / MILLION).toFixed(COUNT_PRECISION))}M`;
  if (count >= THOUSAND) return `${trimZero((count / THOUSAND).toFixed(COUNT_PRECISION))}K`;
  return String(count);
}

function trimZero(value: string): string {
  return value.endsWith(`.${'0'.repeat(COUNT_PRECISION)}`)
    ? value.slice(0, value.length - COUNT_PRECISION - 1)
    : value;
}

export interface DirectoryTreeNode {
  path: string;
  label: string;
  depth: number;
  kind: 'file' | 'folder';
}

export function buildFileTree(files: readonly DirectoryDetailFile[]): DirectoryTreeNode[] {
  const nodes = new Map<string, DirectoryTreeNode>();
  for (const file of files) {
    const segments = file.path.split('/').filter(Boolean);
    segments.forEach((segment, index) => {
      const path = segments.slice(0, index + 1).join('/');
      if (nodes.has(path)) return;
      nodes.set(path, {
        path,
        label: segment,
        depth: index,
        kind: index === segments.length - 1 ? 'file' : 'folder',
      });
    });
  }
  return [...nodes.values()];
}
