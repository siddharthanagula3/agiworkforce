import type { ProviderOfferingCategory } from '@agiworkforce/types';
import { freeModelLabel, type FreeModelLabel } from '@/features/models/lib/free-model-label';
import {
  FREE_QUOTA_CATEGORIES,
  type FreeQuotaCatalogue,
  type FreeQuotaModel,
} from '@/features/models/lib/free-quota-types';
import { freeQuotaSelection } from './free-quota-selection';

export interface FreeModelEntry {
  model: FreeQuotaModel;
  issuer: string;
  label: FreeModelLabel;
  order: number;
}

export type FreeModelPoolPause = 'paused' | 'used_up';

export interface FreeModelPool {
  issuer: string;
  featured: FreeModelEntry[];
  more: FreeModelEntry[];
  unavailable: FreeModelEntry[];
  pause: FreeModelPoolPause | null;
}

export interface FreeModelPresentation {
  categories: ProviderOfferingCategory[];
  category: ProviderOfferingCategory | null;
  pinned: FreeModelEntry | null;
  pools: FreeModelPool[];
}

function compareGeneration(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (right[index] ?? -1) - (left[index] ?? -1);
    if (difference !== 0) return difference;
  }
  return 0;
}

function compareWithinFamily(left: FreeModelEntry, right: FreeModelEntry): number {
  return (
    compareGeneration(left.label.generation, right.label.generation) ||
    Number(left.label.version !== null) - Number(right.label.version !== null) ||
    left.order - right.order
  );
}

function byFamily(entries: readonly FreeModelEntry[]): FreeModelEntry[][] {
  const families = new Map<string, FreeModelEntry[]>();
  for (const entry of entries) {
    const family = families.get(entry.label.family);
    if (family) family.push(entry);
    else families.set(entry.label.family, [entry]);
  }
  return [...families.values()].map((family) => family.sort(compareWithinFamily));
}

function presentPool(issuer: string, entries: readonly FreeModelEntry[]): FreeModelPool {
  const ready = entries.filter((entry) => entry.model.status === 'ready');
  if (ready.length === 0) {
    const spent = entries.every((entry) => ['exhausted', 'expired'].includes(entry.model.status));
    return { issuer, featured: [], more: [], unavailable: [], pause: spent ? 'used_up' : 'paused' };
  }
  const families = byFamily(ready);
  return {
    issuer,
    featured: families.map((family) => family[0]!),
    more: families.flatMap((family) => family.slice(1)),
    unavailable: byFamily(entries.filter((entry) => entry.model.status !== 'ready')).flat(),
    pause: null,
  };
}

export function presentFreeModels(
  catalogues: readonly FreeQuotaCatalogue[],
  options: { category: string | null; selectedId: string },
): FreeModelPresentation {
  const entries = catalogues.flatMap((catalogue) =>
    catalogue.models.flatMap((model, order) => {
      const label = freeQuotaSelection(model.key) ? freeModelLabel(model.key) : null;
      return label ? [{ model, issuer: catalogue.issuer, label, order }] : [];
    }),
  );
  const categories = (Object.keys(FREE_QUOTA_CATEGORIES) as ProviderOfferingCategory[]).filter(
    (key) => entries.some((entry) => entry.model.category === key),
  );
  const category = categories.find((key) => key === options.category) ?? categories[0] ?? null;
  const shown = entries.filter((entry) => entry.model.category === category);
  const pools = [...new Set(shown.map((entry) => entry.issuer))].map((issuer) =>
    presentPool(
      issuer,
      shown.filter((entry) => entry.issuer === issuer),
    ),
  );
  const selected = shown.find((entry) => entry.model.key === options.selectedId) ?? null;
  const pinned =
    selected && !pools.some((pool) => pool.featured.includes(selected)) ? selected : null;
  return {
    categories,
    category,
    pinned,
    pools: pools.map((pool) => ({
      ...pool,
      more: pool.more.filter((entry) => entry !== pinned),
      unavailable: pool.unavailable.filter((entry) => entry !== pinned),
    })),
  };
}
