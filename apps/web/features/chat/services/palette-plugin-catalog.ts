'use client';

import type { PluginRegistryEntry } from '@agiworkforce/types';
import { DIRECTORY_PAGE_SIZE, PLUGINS_PATH } from '@/features/directory/constants';

export interface PalettePlugin {
  id: string;
  name: string;
  description: string;
}

const TOP_PAGE_KEY = '';
const MAX_CACHED_TERMS = 32;

const cached = new Map<string, PalettePlugin[]>();
const inFlight = new Map<string, Promise<PalettePlugin[]>>();

export function invalidatePalettePlugins(): void {
  cached.clear();
  inFlight.clear();
}

function remember(key: string, entries: PalettePlugin[]): void {
  if (cached.size >= MAX_CACHED_TERMS) {
    const oldest = cached.keys().next();
    if (!oldest.done) cached.delete(oldest.value);
  }
  cached.set(key, entries);
}

function paletteHref(term: string): string {
  const params = new URLSearchParams({ limit: String(DIRECTORY_PAGE_SIZE) });
  if (term) params.set('search', term);
  return `${PLUGINS_PATH}?${params.toString()}`;
}

/**
 * The plugin registry as the composer palette needs it. The settings directory
 * reads the same route with four more calls for install state and marketplace
 * sources; a search field that only names and describes entries needs none of
 * that, and a failed read is not worth a notice inside a menu, so it resolves
 * empty and the next search retries.
 */
export function loadPalettePlugins(query = ''): Promise<PalettePlugin[]> {
  const term = query.trim().toLowerCase();
  const key = term || TOP_PAGE_KEY;
  const hit = cached.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = fetch(paletteHref(term), {
    credentials: 'same-origin',
    cache: 'no-store',
  })
    .then(async (response) => {
      if (!response.ok) return [];
      const body = (await response.json()) as { entries?: PluginRegistryEntry[] };
      const entries = (body.entries ?? []).map((entry) => ({
        id: entry.id,
        name: entry.name,
        description: entry.description,
      }));
      remember(key, entries);
      return entries;
    })
    .catch(() => [])
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}
