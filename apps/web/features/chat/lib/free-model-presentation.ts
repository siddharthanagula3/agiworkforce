import {
  providerOfferingLabel,
  type ProviderOfferingCategory,
  type ProviderOfferingLabel,
} from '@agiworkforce/types';
import {
  FREE_QUOTA_CATEGORIES,
  type FreeQuotaCatalogue,
  type FreeQuotaModel,
} from '@/features/models/lib/free-quota-types';
import { freeQuotaSelection } from './free-quota-selection';

export interface FreeModelEntry {
  model: FreeQuotaModel;
  issuer: string;
  label: ProviderOfferingLabel;
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

export interface FreeModelMatches {
  issuer: string;
  entries: FreeModelEntry[];
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

function groupBy(
  entries: readonly FreeModelEntry[],
  keyOf: (entry: FreeModelEntry) => string,
): FreeModelEntry[][] {
  const groups = new Map<string, FreeModelEntry[]>();
  for (const entry of entries) {
    const group = groups.get(keyOf(entry));
    if (group) group.push(entry);
    else groups.set(keyOf(entry), [entry]);
  }
  return [...groups.values()];
}

function byFamily(entries: readonly FreeModelEntry[]): FreeModelEntry[][] {
  return groupBy(entries, (entry) => entry.label.family).map((family) =>
    family.sort(compareWithinFamily),
  );
}

function byLine(family: readonly FreeModelEntry[]): FreeModelEntry[] {
  return groupBy(family, (entry) => entry.label.line).flat();
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
    more: families.flatMap((family) => byLine(family.slice(1))),
    unavailable: byFamily(entries.filter((entry) => entry.model.status !== 'ready')).flatMap(
      byLine,
    ),
    pause: null,
  };
}

function poolsIn(
  entries: readonly FreeModelEntry[],
  category: ProviderOfferingCategory,
): FreeModelPool[] {
  const shown = entries.filter((entry) => entry.model.category === category);
  return [...new Set(shown.map((entry) => entry.issuer))]
    .map((issuer) =>
      presentPool(
        issuer,
        shown.filter((entry) => entry.issuer === issuer),
      ),
    )
    .filter((pool) => category === 'chat' || !pool.pause);
}

export function presentFreeModels(
  catalogues: readonly FreeQuotaCatalogue[],
  options: { category: string | null; selectedId: string },
): FreeModelPresentation {
  const entries = catalogues.flatMap((catalogue) =>
    catalogue.models.flatMap((model, order) => {
      const label = freeQuotaSelection(model.key) ? providerOfferingLabel(model.key) : null;
      return label ? [{ model, issuer: catalogue.issuer, label, order }] : [];
    }),
  );
  const offered = (Object.keys(FREE_QUOTA_CATEGORIES) as ProviderOfferingCategory[])
    .map((key) => ({ key, pools: poolsIn(entries, key) }))
    .filter(({ pools }) => pools.length > 0);
  const categories = offered.map(({ key }) => key);
  const selected = entries.find((entry) => entry.model.key === options.selectedId) ?? null;
  const category =
    categories.find((key) => key === options.category) ??
    categories.find((key) => key === selected?.model.category) ??
    categories[0] ??
    null;
  const pools = offered.find(({ key }) => key === category)?.pools ?? [];
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

export function matchesFreeModelQuery(
  needle: string,
  ...texts: ReadonlyArray<string | null | undefined>
): boolean {
  return texts.some((text) => text?.toLowerCase().includes(needle) ?? false);
}

export function findFreeModels(
  pools: readonly FreeModelPool[],
  needle: string,
): FreeModelMatches[] {
  return pools
    .map((pool) => ({
      issuer: pool.issuer,
      entries: [
        ...pool.featured.flatMap((head) => [
          head,
          ...pool.more.filter((entry) => entry.label.family === head.label.family),
        ]),
        ...pool.unavailable,
      ].filter((entry) =>
        matchesFreeModelQuery(needle, entry.label.displayName, entry.model.providerModelId),
      ),
    }))
    .filter((group) => group.entries.length > 0);
}
