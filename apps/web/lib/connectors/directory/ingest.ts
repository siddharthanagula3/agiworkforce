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
  readSnapshotRecords,
  readSyncState,
  writeSnapshotRecords,
  writeSyncState,
} from '@/lib/connectors/directory/snapshot-cache';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

const MAX_REQUESTS_PER_RUN = 20;
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
  wroteSnapshot: boolean;
}

interface CrawlResult {
  requestsUsed: number;
  entriesSeen: number;
  upserts: DirectoryRecord[];
  removedIds: string[];
  nextCursor: string | null;
  exhausted: boolean;
}

async function crawlPages(
  cursor: string | null,
  updatedSince: string | null,
  fetchImpl: RegistryFetch,
): Promise<CrawlResult> {
  let requestsUsed = 0;
  let entriesSeen = 0;
  const upserts: DirectoryRecord[] = [];
  const removedIds: string[] = [];
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
        removedIds.push(entry.server.name);
        continue;
      }
      if (!isLatestActiveEntry(entry)) continue;
      const normalized = normalizeRegistryEntry(entry);
      if (normalized) upserts.push(normalized);
    }

    if (!page.metadata.nextCursor || page.servers.length === 0) {
      exhausted = true;
      nextCursor = null;
      break;
    }
    nextCursor = page.metadata.nextCursor;
  }

  return { requestsUsed, entriesSeen, upserts, removedIds, nextCursor, exhausted };
}

function mergeRegistryBatch(
  existing: readonly DirectoryRecord[],
  batch: readonly DirectoryRecord[],
  removedIds: readonly string[],
): DirectoryRecord[] {
  const registryOnly = existing.filter((record) => record.sourceRegistry === 'mcp-registry');
  const registryMap = new Map(registryOnly.map((record) => [record.id, record]));
  for (const record of batch) registryMap.set(record.id, record);
  for (const id of removedIds) registryMap.delete(id);
  return [...registryMap.values()];
}

export async function ingestConnectorDirectory(
  fetchImpl: RegistryFetch = fetch,
): Promise<IngestSummary> {
  const runStartedAt = new Date().toISOString();
  const syncState = await readSyncState();

  const mode: IngestMode = syncState.bootstrapComplete ? 'incremental' : 'bootstrap';
  const crawl = await crawlPages(
    mode === 'bootstrap' ? syncState.nextIngestCursor : null,
    mode === 'incremental' ? syncState.lastSyncAt : null,
    fetchImpl,
  );

  let authProbesRun = 0;
  const registryBatch: DirectoryRecord[] = [];
  for (const record of crawl.upserts) {
    if (record.authMode !== 'unknown' || authProbesRun >= AUTH_PROBE_BUDGET_PER_RUN) {
      registryBatch.push(record);
      continue;
    }
    authProbesRun += 1;
    registryBatch.push(await resolveAuthModeForRecord(record));
  }

  const bootstrapComplete = mode === 'incremental' || crawl.exhausted;
  const nextIngestCursor = mode === 'bootstrap' && !crawl.exhausted ? crawl.nextCursor : null;
  const hasChanges = registryBatch.length > 0 || crawl.removedIds.length > 0;
  const wroteSnapshot = mode === 'bootstrap' || hasChanges;

  let totalRecords = 0;
  if (wroteSnapshot) {
    const existing = (await readSnapshotRecords()) ?? [];
    const internalRecords = applyFirstPartyTargets(buildInternalDirectoryRecords());
    const registryRecords = mergeRegistryBatch(existing, registryBatch, crawl.removedIds);
    const merged = mergeDirectoryRecords(internalRecords, registryRecords);
    await writeSnapshotRecords(merged);
    totalRecords = merged.length;
  }

  const lastSyncAt = bootstrapComplete ? runStartedAt : syncState.lastSyncAt;
  await writeSyncState({ nextIngestCursor, bootstrapComplete, lastSyncAt });

  return {
    mode,
    requestsUsed: crawl.requestsUsed,
    entriesSeen: crawl.entriesSeen,
    entriesUpserted: registryBatch.length,
    entriesRemoved: crawl.removedIds.length,
    authProbesRun,
    totalRecords,
    bootstrapComplete,
    wroteSnapshot,
  };
}
