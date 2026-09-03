import 'server-only';

import { logger } from '@/lib/logger';
import { resolveAuthModeForRecord } from '@/lib/connectors/directory/auth-probe';
import { applyFirstPartyTargets } from '@/lib/connectors/directory/first-party';
import {
  buildInternalDirectoryRecords,
  mergeDirectoryRecords,
} from '@/lib/connectors/directory/merge';
import { normalizeRegistryEntry } from '@/lib/connectors/directory/normalize';
import {
  fetchRegistryPage,
  isDeletedEntry,
  isLatestActiveEntry,
  isLatestEntry,
  type RegistryFetch,
} from '@/lib/connectors/directory/registry-client';
import {
  readDirectorySnapshot,
  writeDirectorySnapshot,
} from '@/lib/connectors/directory/snapshot-cache';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

const MAX_REQUESTS_PER_RUN = 20;
const MAX_SNAPSHOT_ENTRIES = 20_000;
const AUTH_PROBE_BUDGET_PER_RUN = 40;

export type IngestMode = 'bootstrap' | 'incremental';

export interface IngestSummary {
  mode: IngestMode;
  requestsUsed: number;
  entriesSeen: number;
  entriesUpserted: number;
  entriesRemoved: number;
  authProbesRun: number;
  totalRecords: number;
  bootstrapComplete: boolean;
}

async function crawlPages(
  registryRecords: Map<string, DirectoryRecord>,
  cursor: string | null,
  updatedSince: string | null,
  fetchImpl: RegistryFetch,
): Promise<{
  requestsUsed: number;
  entriesSeen: number;
  entriesUpserted: number;
  entriesRemoved: number;
  nextCursor: string | null;
  exhausted: boolean;
}> {
  let requestsUsed = 0;
  let entriesSeen = 0;
  let entriesUpserted = 0;
  let entriesRemoved = 0;
  let nextCursor = cursor;
  let exhausted = false;

  while (requestsUsed < MAX_REQUESTS_PER_RUN) {
    let page;
    try {
      page = await fetchRegistryPage({ cursor: nextCursor, updatedSince }, fetchImpl);
    } catch (error) {
      logger.warn({ error }, '[connectors-directory] registry page fetch failed');
      break;
    }
    requestsUsed += 1;
    entriesSeen += page.servers.length;

    for (const entry of page.servers) {
      if (!isLatestEntry(entry)) continue;
      if (isDeletedEntry(entry)) {
        if (registryRecords.delete(entry.server.name)) entriesRemoved += 1;
        continue;
      }
      if (!isLatestActiveEntry(entry)) continue;
      const normalized = normalizeRegistryEntry(entry);
      if (!normalized) continue;
      if (registryRecords.size < MAX_SNAPSHOT_ENTRIES || registryRecords.has(normalized.id)) {
        registryRecords.set(normalized.id, normalized);
        entriesUpserted += 1;
      }
    }

    if (!page.metadata.nextCursor || page.servers.length === 0) {
      exhausted = true;
      nextCursor = null;
      break;
    }
    nextCursor = page.metadata.nextCursor;
  }

  return { requestsUsed, entriesSeen, entriesUpserted, entriesRemoved, nextCursor, exhausted };
}

export async function ingestConnectorDirectory(
  fetchImpl: RegistryFetch = fetch,
): Promise<IngestSummary> {
  const runStartedAt = new Date().toISOString();
  const existing = await readDirectorySnapshot();
  const registryRecords = new Map<string, DirectoryRecord>(
    (existing?.records ?? [])
      .filter((record) => record.sourceRegistry === 'mcp-registry')
      .map((record) => [record.id, record]),
  );

  const mode: IngestMode = existing?.bootstrapComplete === true ? 'incremental' : 'bootstrap';
  const crawl = await crawlPages(
    registryRecords,
    mode === 'bootstrap' ? (existing?.nextIngestCursor ?? null) : null,
    mode === 'incremental' ? (existing?.lastSyncAt ?? null) : null,
    fetchImpl,
  );

  const bootstrapComplete = mode === 'incremental' || crawl.exhausted;
  const nextIngestCursor = mode === 'bootstrap' && !crawl.exhausted ? crawl.nextCursor : null;
  const lastSyncAt = bootstrapComplete ? runStartedAt : (existing?.lastSyncAt ?? null);

  let authProbesRun = 0;
  for (const [id, record] of registryRecords) {
    if (record.authMode !== 'unknown') continue;
    if (authProbesRun >= AUTH_PROBE_BUDGET_PER_RUN) break;
    authProbesRun += 1;
    registryRecords.set(id, await resolveAuthModeForRecord(record));
  }

  const internalRecords = applyFirstPartyTargets(buildInternalDirectoryRecords());
  const merged = mergeDirectoryRecords(internalRecords, [...registryRecords.values()]);

  await writeDirectorySnapshot({
    records: merged,
    nextIngestCursor,
    bootstrapComplete,
    lastSyncAt,
    updatedAt: new Date().toISOString(),
  });

  return {
    mode,
    requestsUsed: crawl.requestsUsed,
    entriesSeen: crawl.entriesSeen,
    entriesUpserted: crawl.entriesUpserted,
    entriesRemoved: crawl.entriesRemoved,
    authProbesRun,
    totalRecords: merged.length,
    bootstrapComplete,
  };
}
