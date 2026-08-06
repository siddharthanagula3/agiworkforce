import 'server-only';

import { cache } from 'react';
import type { PluginManifest, PluginRegistryEntry } from '@agiworkforce/types';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  getPluginRegistryEntry,
  listPluginRegistryEntries,
} from '@/lib/services/plugin-registry-service';

/**
 * Server-side reads for the /plugins pages (CAP-046 slice 3).
 *
 * The pages used to import a TypeScript fixture, so the catalogue could never
 * be wrong and could never be empty — and could never be corrected without a
 * deploy. They now read the hosted registry.
 *
 * The result is a DISCRIMINATED UNION rather than an array, because "the
 * registry is unreachable" and "the catalogue is empty" are different facts and
 * the page must not render one as the other. Returning `[]` on a failed query
 * would silently claim AGI ships no plugins.
 *
 * These pages render inside the same request as the database read, so they call
 * the service directly instead of round-tripping through `/api/plugins`; the
 * HTTP route exists for the CLI and external clients.
 */

export type PluginCatalogResult =
  | { status: 'ok'; entries: PluginRegistryEntry[] }
  | { status: 'unavailable' };

export type PluginEntryResult =
  | { status: 'ok'; entry: PluginRegistryEntry; manifest: PluginManifest | null }
  | { status: 'missing' }
  | { status: 'unavailable' };

/** The full public catalogue, ordered by the service (category, then name). */
export async function loadPluginCatalog(): Promise<PluginCatalogResult> {
  try {
    const { entries } = await listPluginRegistryEntries(getNeonDb(), { limit: 100 });
    return { status: 'ok', entries };
  } catch {
    // The error is intentionally not surfaced to the page: a marketing route
    // must not leak a connection string or query text into rendered HTML.
    return { status: 'unavailable' };
  }
}

/**
 * One catalogue entry plus its manifest, or an honest miss/outage.
 *
 * Wrapped in React `cache` because the detail route asks for the same entry
 * twice per request — once in `generateMetadata`, once in the page body — and
 * that should be one query, not two.
 */
export const loadPluginEntry = cache(async (id: string): Promise<PluginEntryResult> => {
  try {
    const found = await getPluginRegistryEntry(getNeonDb(), id);
    if (!found) return { status: 'missing' };
    return { status: 'ok', entry: found.entry, manifest: found.manifest };
  } catch {
    return { status: 'unavailable' };
  }
});
