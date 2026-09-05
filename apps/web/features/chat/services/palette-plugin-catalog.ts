'use client';

import type { PluginRegistryEntry } from '@agiworkforce/types';
import { DIRECTORY_PAGE_SIZE, PLUGINS_PATH } from '@/features/directory/constants';

export interface PalettePlugin {
  id: string;
  name: string;
  description: string;
}

let cached: PalettePlugin[] | null = null;
let inFlight: Promise<PalettePlugin[]> | null = null;

export function invalidatePalettePlugins(): void {
  cached = null;
  inFlight = null;
}

/**
 * The plugin registry as the composer palette needs it. The settings directory
 * reads the same route with four more calls for install state and marketplace
 * sources; a search field that only names and describes entries needs none of
 * that, and a failed read is not worth a notice inside a menu, so it resolves
 * empty and the next search retries.
 */
export function loadPalettePlugins(): Promise<PalettePlugin[]> {
  if (cached) return Promise.resolve(cached);
  if (inFlight) return inFlight;
  inFlight = fetch(`${PLUGINS_PATH}?limit=${DIRECTORY_PAGE_SIZE}`, {
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
      cached = entries;
      return entries;
    })
    .catch(() => [])
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
