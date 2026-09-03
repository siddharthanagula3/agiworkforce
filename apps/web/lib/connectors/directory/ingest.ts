import 'server-only';

import { logger } from '@/lib/logger';
import { resolveAuthModeForRecord } from '@/lib/connectors/directory/auth-probe';
import {
  buildInternalDirectoryRecords,
  mergeDirectoryRecords,
} from '@/lib/connectors/directory/merge';
import { normalizeRegistryEntry } from '@/lib/connectors/directory/normalize';
import {
  fetchRegistryPage,
  isLatestActiveEntry,
  type RegistryFetch,
} from '@/lib/connectors/directory/registry-client';
import {
  readDirectorySnapshot,
  writeDirectorySnapshot,
} from '@/lib/connectors/directory/snapshot-cache';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

const INGEST_PAGE_BUDGET = 50;
const MAX_SNAPSHOT_ENTRIES = 20_000;
const AUTH_PROBE_BUDGET_PER_RUN = 40;

export interface IngestSummary {
  pagesFetched: number;
  entriesSeen: number;
  entriesNormalized: number;
  authProbesRun: number;
  totalRecords: number;
  cursorExhausted: boolean;
}

export async function ingestConnectorDirectory(
  fetchImpl: RegistryFetch = fetch,
): Promise<IngestSummary> {
  const existing = await readDirectorySnapshot();
  const registryRecords = new Map<string, DirectoryRecord>(
    (existing?.records ?? [])
      .filter((record) => record.sourceRegistry === 'mcp-registry')
      .map((record) => [record.id, record]),
  );

  let cursor = existing?.nextIngestCursor ?? null;
  let pagesFetched = 0;
  let entriesSeen = 0;
  let entriesNormalized = 0;
  let cursorExhausted = false;

  while (pagesFetched < INGEST_PAGE_BUDGET) {
    let page;
    try {
      page = await fetchRegistryPage(cursor, fetchImpl);
    } catch (error) {
      logger.warn({ error }, '[connectors-directory] registry page fetch failed');
      break;
    }
    pagesFetched += 1;
    entriesSeen += page.servers.length;

    for (const entry of page.servers) {
      if (!isLatestActiveEntry(entry)) continue;
      const normalized = normalizeRegistryEntry(entry);
      if (!normalized) continue;
      entriesNormalized += 1;
      if (registryRecords.size < MAX_SNAPSHOT_ENTRIES || registryRecords.has(normalized.id)) {
        registryRecords.set(normalized.id, normalized);
      }
    }

    if (!page.metadata.nextCursor || page.servers.length === 0) {
      cursorExhausted = true;
      cursor = null;
      break;
    }
    cursor = page.metadata.nextCursor;
  }

  let authProbesRun = 0;
  for (const [id, record] of registryRecords) {
    if (record.authMode !== 'unknown') continue;
    if (authProbesRun >= AUTH_PROBE_BUDGET_PER_RUN) break;
    authProbesRun += 1;
    registryRecords.set(id, await resolveAuthModeForRecord(record));
  }

  const internalRecords = buildInternalDirectoryRecords();
  const merged = mergeDirectoryRecords(internalRecords, [...registryRecords.values()]);

  await writeDirectorySnapshot({
    records: merged,
    nextIngestCursor: cursor,
    updatedAt: new Date().toISOString(),
  });

  return {
    pagesFetched,
    entriesSeen,
    entriesNormalized,
    authProbesRun,
    totalRecords: merged.length,
    cursorExhausted,
  };
}
