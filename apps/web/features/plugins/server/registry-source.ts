import 'server-only';

import { cache } from 'react';
import type { PluginManifest, PluginRegistryEntry } from '@agiworkforce/types';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  getPluginRegistryEntry,
  listPluginRegistryEntries,
} from '@/lib/services/plugin-registry-service';
import {
  cachedRenderInput,
  RENDER_CACHE_SECONDS,
  RENDER_CACHE_TAGS,
} from '@/lib/server/render-cache';

export type PluginCatalogResult =
  | { status: 'ok'; entries: PluginRegistryEntry[] }
  | { status: 'unavailable' };

export type PluginEntryResult =
  | { status: 'ok'; entry: PluginRegistryEntry; manifest: PluginManifest | null }
  | { status: 'missing' }
  | { status: 'unavailable' };

async function readPluginCatalog(): Promise<PluginCatalogResult> {
  try {
    const { entries } = await listPluginRegistryEntries(getNeonDb(), { limit: 100 });
    return { status: 'ok', entries };
  } catch {
    return { status: 'unavailable' };
  }
}

async function readPluginEntry(id: string): Promise<PluginEntryResult> {
  try {
    const found = await getPluginRegistryEntry(getNeonDb(), id);
    if (!found) return { status: 'missing' };
    return { status: 'ok', entry: found.entry, manifest: found.manifest };
  } catch {
    return { status: 'unavailable' };
  }
}

// The published registry is the same for every visitor and only moves when
// someone publishes, so it is read once per window rather than once per page
// view. `revalidateTag(RENDER_CACHE_TAGS.pluginCatalog)` drops it immediately
// when a publish path lands.
const cachedPluginCatalog = cachedRenderInput(readPluginCatalog, {
  keyParts: ['plugins', 'catalog'],
  tags: [RENDER_CACHE_TAGS.pluginCatalog],
  revalidate: RENDER_CACHE_SECONDS.catalog,
});

// A wrapper per id, because `unstable_cache` fixes its tag list at wrap time
// and a single plugin has to be invalidatable without dropping the catalogue.
// The id comes straight off the URL, so the map is capped: without a bound,
// requests for ids that do not exist would grow it without limit.
const MAX_ENTRY_READERS = 256;
const entryReaders = new Map<string, () => Promise<PluginEntryResult>>();

function cachedPluginEntry(id: string): Promise<PluginEntryResult> {
  const existing = entryReaders.get(id);
  if (existing) return existing();

  const read = cachedRenderInput(() => readPluginEntry(id), {
    keyParts: ['plugins', 'entry', id],
    tags: [RENDER_CACHE_TAGS.pluginCatalog, RENDER_CACHE_TAGS.pluginEntry(id)],
    revalidate: RENDER_CACHE_SECONDS.catalog,
  });
  if (entryReaders.size >= MAX_ENTRY_READERS) {
    const oldest = entryReaders.keys().next();
    if (!oldest.done) entryReaders.delete(oldest.value);
  }
  entryReaders.set(id, read);
  return read();
}

export function entryReaderCountForTests(): number {
  return entryReaders.size;
}

export const loadPluginCatalog = cache(
  async (): Promise<PluginCatalogResult> => cachedPluginCatalog(),
);

// `cache` on top of the cross-request cache as well: the detail route resolves
// the same entry in `generateMetadata` and again in the page body, and only the
// per-request memo collapses that into one lookup on a cold cache.
export const loadPluginEntry = cache(
  async (id: string): Promise<PluginEntryResult> => cachedPluginEntry(id),
);
