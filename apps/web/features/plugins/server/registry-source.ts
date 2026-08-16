import 'server-only';

import { cache } from 'react';
import type { PluginManifest, PluginRegistryEntry } from '@agiworkforce/types';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  getPluginRegistryEntry,
  listPluginRegistryEntries,
} from '@/lib/services/plugin-registry-service';

export type PluginCatalogResult =
  | { status: 'ok'; entries: PluginRegistryEntry[] }
  | { status: 'unavailable' };

export type PluginEntryResult =
  | { status: 'ok'; entry: PluginRegistryEntry; manifest: PluginManifest | null }
  | { status: 'missing' }
  | { status: 'unavailable' };

export async function loadPluginCatalog(): Promise<PluginCatalogResult> {
  try {
    const { entries } = await listPluginRegistryEntries(getNeonDb(), { limit: 100 });
    return { status: 'ok', entries };
  } catch {
    return { status: 'unavailable' };
  }
}

export const loadPluginEntry = cache(async (id: string): Promise<PluginEntryResult> => {
  try {
    const found = await getPluginRegistryEntry(getNeonDb(), id);
    if (!found) return { status: 'missing' };
    return { status: 'ok', entry: found.entry, manifest: found.manifest };
  } catch {
    return { status: 'unavailable' };
  }
});
