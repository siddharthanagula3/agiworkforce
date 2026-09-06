import 'server-only';

import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  isAuthProbeCandidate,
  resolveAuthModeForRecord,
} from '@/lib/connectors/directory/auth-probe';
import { resolveSiteIconForRecord } from '@/lib/connectors/directory/favicon-probe';
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
  carrySiteIcon,
  hasResolvedSiteIcon,
  pendingSiteIconSource,
} from '@/lib/connectors/directory/site-icon';
import {
  clearIngestLease,
  DEFAULT_SYNC_STATE,
  readIngestLease,
  readSnapshotRecords,
  readSyncState,
  type DirectoryIngestLease,
  writeIngestLease,
  writeSnapshotRecords,
  writeSyncState,
} from '@/lib/connectors/directory/snapshot-cache';
import { isFeatured } from '@/lib/connectors/directory/snapshot-view';
import type {
  DirectoryBadge,
  DirectoryRecord,
  DirectorySource,
} from '@/lib/connectors/directory/types';

const MS_PER_SECOND = 1_000;
const CRAWL_BUDGET_FRACTION = 0.6;
const AUTH_PROBE_BUDGET_FRACTION = 0.8;
const AUTH_PROBE_CONCURRENCY = 16;
const AUTH_PROBE_FLOOR_PER_RUN = 2_000;
const AUTH_PROBES_PER_ENTRY_SEEN = 0.25;
const SITE_ICON_PROBE_BUDGET_FRACTION = 0.9;
const SITE_ICON_PROBE_CONCURRENCY = 8;
const SITE_ICON_PROBE_FLOOR_PER_RUN = 500;
const SITE_ICON_PROBES_PER_ENTRY_SEEN = 0.1;
const FEATURED_ICON_TIER = 0;
const OFFICIAL_ICON_TIER = 1;
const BACKLOG_ICON_TIER = 2;
const OFFICIAL_BADGE: DirectoryBadge = 'official';
const REGISTRY_SOURCE: DirectorySource = 'mcp-registry';
const FAILED_ENTRY_SAMPLE_SIZE = 5;

export type IngestMode = 'bootstrap' | 'incremental';
export type CrawlStop = 'exhausted' | 'budget' | 'error';
type Clock = () => number;

export interface IngestBudget {
  readonly crawlMs: number;
  readonly probeMs: number;
  readonly siteIconMs: number;
  readonly totalMs: number;
}

export interface IngestOptions {
  readonly budget: IngestBudget;
  readonly fetchImpl?: RegistryFetch;
  readonly now?: Clock;
  readonly rebuild?: boolean;
}

export function ingestBudgetForMaxDuration(maxDurationSeconds: number): IngestBudget {
  const totalMs = maxDurationSeconds * MS_PER_SECOND;
  return {
    crawlMs: Math.floor(totalMs * CRAWL_BUDGET_FRACTION),
    probeMs: Math.floor(totalMs * AUTH_PROBE_BUDGET_FRACTION),
    siteIconMs: Math.floor(totalMs * SITE_ICON_PROBE_BUDGET_FRACTION),
    totalMs,
  };
}

export interface IngestSummary {
  mode: IngestMode;
  requestsUsed: number;
  entriesSeen: number;
  entriesUpserted: number;
  entriesRemoved: number;
  entriesFailed: number;
  crawlStop: CrawlStop;
  authProbesRun: number;
  authProbesResolved: number;
  authProbeErrors: number;
  authProbeBacklog: number;
  siteIconProbesRun: number;
  siteIconProbesResolved: number;
  siteIconProbeErrors: number;
  siteIconProbeBacklog: number;
  siteIconRecords: number;
  totalRecords: number;
  bootstrapComplete: boolean;
  wroteSnapshot: boolean;
  crawlDurationMs: number;
  probeDurationMs: number;
  siteIconDurationMs: number;
  durationMs: number;
}

interface CrawlResult {
  requestsUsed: number;
  entriesSeen: number;
  upserts: DirectoryRecord[];
  removedIds: string[];
  failedNames: string[];
  nextCursor: string | null;
  stop: CrawlStop;
}

async function crawlPages(
  cursor: string | null,
  updatedSince: string | null,
  fetchImpl: RegistryFetch,
  deadlineMs: number,
  now: Clock,
): Promise<CrawlResult> {
  let requestsUsed = 0;
  let entriesSeen = 0;
  const upserts: DirectoryRecord[] = [];
  const removedIds: string[] = [];
  const failedNames: string[] = [];
  let nextCursor = cursor;
  let stop: CrawlStop = 'budget';

  while (now() < deadlineMs) {
    let page;
    try {
      page = await fetchRegistryPage({ cursor: nextCursor, updatedSince }, fetchImpl);
    } catch (error) {
      logger.warn({ error }, '[connectors-directory] registry page fetch failed');
      stop = 'error';
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
      try {
        const normalized = normalizeRegistryEntry(entry);
        if (normalized) upserts.push(normalized);
      } catch {
        failedNames.push(entry.server?.name ?? '');
      }
    }

    if (!page.metadata.nextCursor || page.servers.length === 0) {
      stop = 'exhausted';
      nextCursor = null;
      break;
    }
    nextCursor = page.metadata.nextCursor;
  }

  return { requestsUsed, entriesSeen, upserts, removedIds, failedNames, nextCursor, stop };
}

function compareById(left: DirectoryRecord, right: DirectoryRecord): number {
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

function rotateAfter(
  records: readonly DirectoryRecord[],
  cursor: string | null,
): DirectoryRecord[] {
  if (cursor === null) return [...records];
  const start = records.findIndex((record) => record.id > cursor);
  if (start <= 0) return [...records];
  return [...records.slice(start), ...records.slice(0, start)];
}

interface ProbePlan {
  readonly candidates: readonly DirectoryRecord[];
  readonly backlogStart: number;
  readonly cap: number;
}

function planAuthProbes(
  fresh: readonly DirectoryRecord[],
  existingRegistry: readonly DirectoryRecord[],
  removedIds: ReadonlySet<string>,
  cursor: string | null,
  entriesSeen: number,
): ProbePlan {
  const freshIds = new Set(fresh.map((record) => record.id));
  const freshCandidates = fresh.filter(isAuthProbeCandidate);
  const backlog = existingRegistry
    .filter(
      (record) =>
        !freshIds.has(record.id) && !removedIds.has(record.id) && isAuthProbeCandidate(record),
    )
    .sort(compareById);
  return {
    candidates: [...freshCandidates, ...rotateAfter(backlog, cursor)],
    backlogStart: freshCandidates.length,
    cap: AUTH_PROBE_FLOOR_PER_RUN + Math.floor(entriesSeen * AUTH_PROBES_PER_ENTRY_SEEN),
  };
}

function siteIconTier(record: DirectoryRecord): number {
  if (isFeatured(record)) return FEATURED_ICON_TIER;
  if (record.badge === OFFICIAL_BADGE) return OFFICIAL_ICON_TIER;
  return BACKLOG_ICON_TIER;
}

function compareBySiteIconTier(left: DirectoryRecord, right: DirectoryRecord): number {
  return siteIconTier(left) - siteIconTier(right) || compareById(left, right);
}

function planSiteIconProbes(
  records: readonly DirectoryRecord[],
  cursor: string | null,
  entriesSeen: number,
): ProbePlan {
  const pending = records.filter(pendingSiteIconSource);
  const head = pending
    .filter((record) => siteIconTier(record) !== BACKLOG_ICON_TIER)
    .sort(compareBySiteIconTier);
  const backlog = pending
    .filter((record) => siteIconTier(record) === BACKLOG_ICON_TIER)
    .sort(compareById);
  return {
    candidates: [...head, ...rotateAfter(backlog, cursor)],
    backlogStart: head.length,
    cap: SITE_ICON_PROBE_FLOOR_PER_RUN + Math.floor(entriesSeen * SITE_ICON_PROBES_PER_ENTRY_SEEN),
  };
}

interface ProbeResult {
  resolved: DirectoryRecord[];
  run: number;
  errors: number;
  lastIndex: number;
}

type Probe = (record: DirectoryRecord) => Promise<DirectoryRecord | null>;

async function probeAuthMode(record: DirectoryRecord): Promise<DirectoryRecord | null> {
  const probed = await resolveAuthModeForRecord(record);
  return probed.authMode !== 'unknown' ? probed : null;
}

async function probeSiteIcon(record: DirectoryRecord): Promise<DirectoryRecord | null> {
  const probed = await resolveSiteIconForRecord(record);
  return hasResolvedSiteIcon(probed) ? probed : null;
}

async function runProbes(
  candidates: readonly DirectoryRecord[],
  cap: number,
  deadlineMs: number,
  now: Clock,
  concurrency: number,
  probe: Probe,
): Promise<ProbeResult> {
  const resolved: DirectoryRecord[] = [];
  let run = 0;
  let errors = 0;
  let nextIndex = 0;
  let lastIndex = -1;

  const worker = async (): Promise<void> => {
    while (nextIndex < candidates.length && run < cap && now() < deadlineMs) {
      const index = nextIndex;
      nextIndex += 1;
      run += 1;
      lastIndex = index;
      try {
        const probed = await probe(candidates[index]!);
        if (probed) resolved.push(probed);
      } catch {
        errors += 1;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, worker));
  return { resolved, run, errors, lastIndex };
}

function cursorAfterSweep(plan: ProbePlan, result: ProbeResult, previous: string | null) {
  const sweptBacklog = result.lastIndex >= plan.backlogStart;
  return sweptBacklog ? plan.candidates[result.lastIndex]!.id : previous;
}

function mergeRegistryBatch(
  existingRegistry: readonly DirectoryRecord[],
  batch: readonly DirectoryRecord[],
  removedIds: ReadonlySet<string>,
): DirectoryRecord[] {
  const registryMap = new Map(existingRegistry.map((record) => [record.id, record]));
  for (const record of batch) registryMap.set(record.id, record);
  for (const id of removedIds) registryMap.delete(id);
  return [...registryMap.values()];
}

async function acquireIngestLease(
  startedAtMs: number,
  totalMs: number,
): Promise<DirectoryIngestLease> {
  const held = await readIngestLease(startedAtMs);
  if (held) {
    throw createError.conflict(
      `Connector directory ingest already running since ${held.startedAt}; it expires at ${held.expiresAt}.`,
    );
  }
  const lease: DirectoryIngestLease = {
    startedAt: new Date(startedAtMs).toISOString(),
    expiresAt: new Date(startedAtMs + totalMs).toISOString(),
  };
  await writeIngestLease(lease);
  return lease;
}

export async function ingestConnectorDirectory(options: IngestOptions): Promise<IngestSummary> {
  const now = options.now ?? Date.now;
  const startedAtMs = now();
  await acquireIngestLease(startedAtMs, options.budget.totalMs);
  try {
    return await runIngest(options, now, startedAtMs);
  } finally {
    await clearIngestLease();
  }
}

async function runIngest(
  options: IngestOptions,
  now: Clock,
  startedAtMs: number,
): Promise<IngestSummary> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const runStartedAt = new Date(startedAtMs).toISOString();
  const storedState = await readSyncState();
  const syncState = options.rebuild ? DEFAULT_SYNC_STATE : storedState;

  const mode: IngestMode = syncState.bootstrapComplete ? 'incremental' : 'bootstrap';
  const resumingBootstrap = mode === 'bootstrap' && syncState.nextIngestCursor !== null;
  const bootstrapStartedAt =
    mode === 'incremental'
      ? syncState.bootstrapStartedAt
      : resumingBootstrap
        ? (syncState.bootstrapStartedAt ?? runStartedAt)
        : runStartedAt;

  const crawl = await crawlPages(
    mode === 'bootstrap' ? syncState.nextIngestCursor : null,
    mode === 'incremental' ? syncState.lastSyncAt : null,
    fetchImpl,
    startedAtMs + options.budget.crawlMs,
    now,
  );
  const crawlEndedAtMs = now();

  const existing = (await readSnapshotRecords()) ?? [];
  const existingRegistry = existing.filter((record) => record.sourceRegistry === REGISTRY_SOURCE);
  const removedIds = new Set(crawl.removedIds);
  const plan = planAuthProbes(
    crawl.upserts,
    existingRegistry,
    removedIds,
    syncState.authProbeCursor,
    crawl.entriesSeen,
  );
  const probes = await runProbes(
    plan.candidates,
    plan.cap,
    startedAtMs + options.budget.probeMs,
    now,
    AUTH_PROBE_CONCURRENCY,
    probeAuthMode,
  );
  const probesEndedAtMs = now();

  const registryBatch = new Map(crawl.upserts.map((record) => [record.id, record]));
  for (const record of probes.resolved) registryBatch.set(record.id, record);

  const exhausted = crawl.stop === 'exhausted';
  const bootstrapComplete = mode === 'incremental' || exhausted;
  const nextIngestCursor = bootstrapComplete ? null : crawl.nextCursor;
  const hasChanges = registryBatch.size > 0 || removedIds.size > 0;

  const existingById = new Map(existing.map((record) => [record.id, record]));
  const internalRecords = applyFirstPartyTargets(buildInternalDirectoryRecords());
  const registryRecords = mergeRegistryBatch(
    existingRegistry,
    [...registryBatch.values()],
    removedIds,
  );
  const merged = mergeDirectoryRecords(internalRecords, registryRecords).map((record) =>
    carrySiteIcon(record, existingById.get(record.id)),
  );
  const mergedAtMs = now();
  const siteIconPlan = planSiteIconProbes(merged, syncState.siteIconCursor, crawl.entriesSeen);
  const siteIcons = await runProbes(
    siteIconPlan.candidates,
    siteIconPlan.cap,
    startedAtMs + options.budget.siteIconMs,
    now,
    SITE_ICON_PROBE_CONCURRENCY,
    probeSiteIcon,
  );
  const siteIconsEndedAtMs = now();

  const wroteSnapshot = mode === 'bootstrap' || hasChanges || siteIcons.resolved.length > 0;
  let snapshot = existing;
  if (wroteSnapshot) {
    const resolvedById = new Map(siteIcons.resolved.map((record) => [record.id, record]));
    snapshot = merged.map((record) => resolvedById.get(record.id) ?? record);
    await writeSnapshotRecords(snapshot);
  }

  const lastSyncAt = !exhausted
    ? syncState.lastSyncAt
    : mode === 'bootstrap'
      ? bootstrapStartedAt
      : runStartedAt;
  await writeSyncState({
    nextIngestCursor,
    bootstrapComplete,
    bootstrapStartedAt,
    lastSyncAt,
    authProbeCursor: cursorAfterSweep(plan, probes, syncState.authProbeCursor),
    siteIconCursor: cursorAfterSweep(siteIconPlan, siteIcons, syncState.siteIconCursor),
  });

  if (crawl.failedNames.length > 0) {
    logger.warn(
      {
        failed: crawl.failedNames.length,
        sample: crawl.failedNames.slice(0, FAILED_ENTRY_SAMPLE_SIZE),
      },
      '[connectors-directory] registry entries could not be normalized',
    );
  }
  if (probes.errors > 0) {
    logger.warn({ errors: probes.errors }, '[connectors-directory] auth probes failed');
  }
  if (siteIcons.errors > 0) {
    logger.warn({ errors: siteIcons.errors }, '[connectors-directory] site icon probes failed');
  }

  return {
    mode,
    requestsUsed: crawl.requestsUsed,
    entriesSeen: crawl.entriesSeen,
    entriesUpserted: registryBatch.size,
    entriesRemoved: removedIds.size,
    entriesFailed: crawl.failedNames.length,
    crawlStop: crawl.stop,
    authProbesRun: probes.run,
    authProbesResolved: probes.resolved.length,
    authProbeErrors: probes.errors,
    authProbeBacklog: plan.candidates.length - probes.resolved.length,
    siteIconProbesRun: siteIcons.run,
    siteIconProbesResolved: siteIcons.resolved.length,
    siteIconProbeErrors: siteIcons.errors,
    siteIconProbeBacklog: siteIconPlan.candidates.length - siteIcons.resolved.length,
    siteIconRecords: snapshot.filter(hasResolvedSiteIcon).length,
    totalRecords: snapshot.length,
    bootstrapComplete,
    wroteSnapshot,
    crawlDurationMs: crawlEndedAtMs - startedAtMs,
    probeDurationMs: probesEndedAtMs - crawlEndedAtMs,
    siteIconDurationMs: siteIconsEndedAtMs - mergedAtMs,
    durationMs: now() - startedAtMs,
  };
}
