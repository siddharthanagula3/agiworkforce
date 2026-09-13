import {
  MODEL_PICKER_FILTER_CAPABILITIES,
  type ModelPickerFilterCapability,
} from '@agiworkforce/unified-chat/model-picker';
import type { ModelCatalogueEntry } from '@/app/api/models/catalogue/route';

export type ModelCollection = 'all' | 'favourites' | 'recent';
export type ModelAccess = 'all' | 'included' | 'locked';

const CAPABILITY_LABELS: Readonly<Record<ModelPickerFilterCapability, string>> = {
  imageInput: 'Vision',
  reasoning: 'Reasoning',
  functionCalling: 'Tools',
  webSearch: 'Search',
  codeExecution: 'Code execution',
  imageOutput: 'Image out',
  videoOutput: 'Video out',
  audioInput: 'Audio in',
  audioOutput: 'Audio out',
};

export interface ModelCapabilityFilter {
  capability: ModelPickerFilterCapability;
  label: string;
}

export const MODEL_CAPABILITY_FILTERS: readonly ModelCapabilityFilter[] =
  MODEL_PICKER_FILTER_CAPABILITIES.map((capability) => ({
    capability,
    label: CAPABILITY_LABELS[capability],
  }));

export const MODEL_COLLECTIONS: readonly { key: ModelCollection; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'favourites', label: 'Favourites' },
  { key: 'recent', label: 'Recent' },
];

export const MODEL_ACCESS_FILTERS: readonly { key: ModelAccess; label: string }[] = [
  { key: 'all', label: 'Any access' },
  { key: 'included', label: 'In your plan' },
  { key: 'locked', label: 'Needs an upgrade' },
];

export interface ModelFilterState {
  query: string;
  developer: string | null;
  capabilities: ReadonlySet<ModelPickerFilterCapability>;
  collection: ModelCollection;
  access: ModelAccess;
}

export interface ModelFilterSources {
  favouriteModelIds: readonly string[];
  recentModelIds: readonly string[];
}

export const EMPTY_MODEL_FILTERS: ModelFilterState = {
  query: '',
  developer: null,
  capabilities: new Set(),
  collection: 'all',
  access: 'all',
};

export function hasCapability(
  entry: ModelCatalogueEntry,
  capability: ModelPickerFilterCapability,
): boolean {
  return entry.capabilities[capability] === true;
}

export function entryCapabilities(entry: ModelCatalogueEntry): readonly ModelCapabilityFilter[] {
  return MODEL_CAPABILITY_FILTERS.filter((filter) => hasCapability(entry, filter.capability));
}

function matchesQuery(entry: ModelCatalogueEntry, needle: string): boolean {
  if (!needle) return true;
  return [entry.displayName, entry.developerLabel, entry.family ?? '', entry.id]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

function matchesAccess(entry: ModelCatalogueEntry, access: ModelAccess): boolean {
  if (access === 'included') return entry.admitted;
  if (access === 'locked') return !entry.admitted;
  return true;
}

export function filterCatalogueEntries(
  entries: readonly ModelCatalogueEntry[],
  filters: ModelFilterState,
  sources: ModelFilterSources,
): ModelCatalogueEntry[] {
  const needle = filters.query.trim().toLowerCase();
  const favourites = new Set(sources.favouriteModelIds);
  const recentRank = new Map(sources.recentModelIds.map((id, index) => [id, index]));

  const matched = entries.filter((entry) => {
    if (filters.collection === 'favourites' && !favourites.has(entry.id)) return false;
    if (filters.collection === 'recent' && !recentRank.has(entry.id)) return false;
    if (filters.developer && entry.developer !== filters.developer) return false;
    if (!matchesQuery(entry, needle)) return false;
    if (!matchesAccess(entry, filters.access)) return false;
    for (const capability of filters.capabilities) {
      if (!hasCapability(entry, capability)) return false;
    }
    return true;
  });

  if (filters.collection === 'recent') {
    return matched.sort(
      (left, right) => (recentRank.get(left.id) ?? 0) - (recentRank.get(right.id) ?? 0),
    );
  }
  return matched.sort(
    (left, right) =>
      Number(right.admitted) - Number(left.admitted) ||
      left.developerLabel.localeCompare(right.developerLabel) ||
      left.displayName.localeCompare(right.displayName),
  );
}
