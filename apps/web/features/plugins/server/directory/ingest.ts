import 'server-only';

import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  GITHUB_AUTHENTICATED_INSPECTIONS_PER_RUN,
  GITHUB_INSPECTION_CONCURRENCY,
  GITHUB_TOKEN_ENV_VAR,
  GITHUB_UNAUTHENTICATED_INSPECTIONS_PER_RUN,
  INGEST_INSPECTION_BUDGET_FRACTION,
  INGEST_LEASE_MESSAGE,
  INGEST_MANIFEST_BUDGET_FRACTION,
  INGEST_PUBLIC_BUDGET_FRACTION,
  MS_PER_SECOND,
  OFFICIAL_MARKETPLACE_NAME,
  PLUGIN_DIRECTORY_FAILURE_SAMPLE_SIZE,
  PUBLIC_DIRECTORY_DETAIL_FETCHES_PER_RUN,
  SOURCE_FACET_MARKETPLACE,
  SOURCE_FACET_PARTNER,
  WORKS_WITH_CLAUDE_CODE,
} from './constants';
import { marketplaceDirectoryEntry, publicOnlyDirectoryEntry, slugify } from './entries';
import {
  fetchRepositoryTree,
  inspectionKey,
  inspectPluginSource,
  type RepositoryTree,
  type TreeFetchResult,
} from './inspection';
import { mergeDirectoryEntries } from './merge';
import {
  DIRECTORY_MARKETPLACES,
  fetchClaudeMarketplace,
  resolvePluginSource,
  type ClaudeMarketplacePlugin,
  type ClaudeMarketplaceSource,
  type DirectoryFetch,
  type FetchedClaudeMarketplace,
} from './official-marketplace';
import {
  directoryRequestSpacing,
  fetchDirectoryDetail,
  fetchPublicDirectory,
} from './public-directory';
import {
  clearPluginIngestLease,
  DEFAULT_PLUGIN_SYNC_STATE,
  readPluginIngestLease,
  readPluginInspections,
  readPluginSnapshotRecords,
  readPluginSyncState,
  writePluginIngestLease,
  writePluginInspections,
  writePluginSnapshotRecords,
  writePluginSyncState,
  type PluginIngestLease,
  type PluginInspectionMap,
} from './snapshot-cache';
import type {
  PluginDirectoryEntry,
  PluginSourceLocation,
  PublicDirectoryCard,
  PublicDirectoryDetail,
} from './types';

type Clock = () => number;

export interface PluginIngestBudget {
  readonly manifestMs: number;
  readonly publicMs: number;
  readonly inspectionMs: number;
  readonly totalMs: number;
}

export function ingestBudgetForMaxDuration(maxDurationSeconds: number): PluginIngestBudget {
  const totalMs = maxDurationSeconds * MS_PER_SECOND;
  return {
    manifestMs: Math.floor(totalMs * INGEST_MANIFEST_BUDGET_FRACTION),
    publicMs: Math.floor(totalMs * INGEST_PUBLIC_BUDGET_FRACTION),
    inspectionMs: Math.floor(totalMs * INGEST_INSPECTION_BUDGET_FRACTION),
    totalMs,
  };
}

export interface PluginIngestOptions {
  readonly budget: PluginIngestBudget;
  readonly fetchImpl?: DirectoryFetch;
  readonly now?: Clock;
  readonly rebuild?: boolean;
  readonly githubToken?: string | undefined;
  readonly marketplaces?: readonly ClaudeMarketplaceSource[];
}

export interface PluginIngestSummary {
  marketplacesFetched: number;
  marketplacesFailed: string[];
  manifestPlugins: number;
  manifestPluginsSkipped: number;
  publicCards: number;
  publicComplete: boolean;
  publicMatched: number;
  publicOnly: number;
  detailFetches: number;
  inspectionsRun: number;
  inspectionsCached: number;
  inspectionsFailed: number;
  inspectionsPending: number;
  rateLimited: boolean;
  verified: number;
  withInstalls: number;
  webInstallable: number;
  duplicatesDropped: number;
  bySource: Record<string, number>;
  totalRecords: number;
  wroteSnapshot: boolean;
  durationMs: number;
}

interface ManifestPluginCandidate {
  plugin: ClaudeMarketplacePlugin;
  marketplace: FetchedClaudeMarketplace;
  location: PluginSourceLocation | null;
  key: string | null;
}

function githubToken(options: PluginIngestOptions): string | undefined {
  const token = options.githubToken ?? process.env[GITHUB_TOKEN_ENV_VAR];
  return token && token.trim().length > 0 ? token.trim() : undefined;
}

async function acquireLease(startedAtMs: number, totalMs: number): Promise<PluginIngestLease> {
  const held = await readPluginIngestLease(startedAtMs);
  if (held) {
    throw createError.conflict(
      `${INGEST_LEASE_MESSAGE} since ${held.startedAt}; it expires at ${held.expiresAt}.`,
    );
  }
  const lease: PluginIngestLease = {
    startedAt: new Date(startedAtMs).toISOString(),
    expiresAt: new Date(startedAtMs + totalMs).toISOString(),
  };
  await writePluginIngestLease(lease);
  return lease;
}

export async function ingestPluginDirectory(
  options: PluginIngestOptions,
): Promise<PluginIngestSummary> {
  const now = options.now ?? Date.now;
  const startedAtMs = now();
  await acquireLease(startedAtMs, options.budget.totalMs);
  try {
    return await runIngest(options, now, startedAtMs);
  } finally {
    await clearPluginIngestLease();
  }
}

async function fetchMarketplaces(
  marketplaces: readonly ClaudeMarketplaceSource[],
  fetchImpl: DirectoryFetch,
  deadlineMs: number,
  now: Clock,
): Promise<{ fetched: FetchedClaudeMarketplace[]; failed: string[] }> {
  const fetched: FetchedClaudeMarketplace[] = [];
  const failed: string[] = [];
  for (const marketplace of marketplaces) {
    if (now() >= deadlineMs) {
      failed.push(marketplace.name);
      continue;
    }
    try {
      fetched.push(await fetchClaudeMarketplace(marketplace, fetchImpl));
    } catch (error) {
      logger.warn(
        { error, marketplace: marketplace.name },
        '[plugins-directory] manifest fetch failed',
      );
      failed.push(marketplace.name);
    }
  }
  return { fetched, failed };
}

function cardsFromExisting(existing: readonly PluginDirectoryEntry[]): PublicDirectoryCard[] {
  return existing
    .filter((entry) => entry.installs !== null || entry.verified || entry.worksWith.length > 0)
    .map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      description: entry.description,
      verified: entry.verified,
      installs: entry.installs,
      worksWith: entry.worksWith.filter((value) => value !== 'web'),
    }));
}

function matchCards(
  cards: readonly PublicDirectoryCard[],
  manifests: readonly FetchedClaudeMarketplace[],
): Map<string, PublicDirectoryCard> {
  const bySlug = new Map(cards.map((card) => [card.slug, card]));
  const matched = new Map<string, PublicDirectoryCard>();
  for (const marketplace of manifests) {
    const renamedTo = new Map<string, string[]>();
    for (const [oldName, newName] of Object.entries(marketplace.manifest.renames)) {
      renamedTo.set(newName, [...(renamedTo.get(newName) ?? []), oldName]);
    }
    for (const plugin of marketplace.manifest.plugins) {
      const candidates = [
        plugin.name,
        ...(renamedTo.get(plugin.name) ?? []),
        ...(plugin.displayName ? [slugify(plugin.displayName)] : []),
      ];
      const card = candidates.map((slug) => bySlug.get(slug)).find((found) => found !== undefined);
      if (card && !matched.has(plugin.name)) matched.set(plugin.name, card);
    }
  }
  return matched;
}

function candidatesFor(manifests: readonly FetchedClaudeMarketplace[]): ManifestPluginCandidate[] {
  const candidates: ManifestPluginCandidate[] = [];
  for (const marketplace of manifests) {
    for (const plugin of marketplace.manifest.plugins) {
      const location = resolvePluginSource(plugin.source, marketplace.source);
      candidates.push({
        plugin,
        marketplace,
        location,
        key: location ? inspectionKey(location) : null,
      });
    }
  }
  return candidates;
}

interface InspectionRun {
  run: number;
  failed: number;
  pending: number;
  rateLimited: boolean;
}

async function runInspections(
  candidates: readonly ManifestPluginCandidate[],
  inspections: PluginInspectionMap,
  options: { token: string | undefined; fetchImpl: DirectoryFetch; deadlineMs: number; now: Clock },
): Promise<InspectionRun> {
  const unique = candidates.filter(
    (candidate, index) =>
      candidate.key !== null &&
      !(candidate.key in inspections) &&
      candidates.findIndex((other) => other.key === candidate.key) === index,
  );
  const sharesMarketplaceRepository = (candidate: ManifestPluginCandidate): boolean =>
    candidate.location!.repositoryUrl.toLowerCase() ===
    candidate.marketplace.source.repositoryUrl.toLowerCase();
  const pending = [
    ...unique.filter(sharesMarketplaceRepository),
    ...unique.filter((candidate) => !sharesMarketplaceRepository(candidate)),
  ];
  let token = options.token;
  let cap = token
    ? GITHUB_AUTHENTICATED_INSPECTIONS_PER_RUN
    : GITHUB_UNAUTHENTICATED_INSPECTIONS_PER_RUN;
  const sharedTrees = new Map<string, Promise<TreeFetchResult>>();
  let nextIndex = 0;
  let run = 0;
  let failed = 0;
  let rateLimited = false;

  const dropRejectedToken = (): void => {
    if (!token) return;
    token = undefined;
    cap = GITHUB_UNAUTHENTICATED_INSPECTIONS_PER_RUN;
    sharedTrees.clear();
    logger.warn(
      { envVar: GITHUB_TOKEN_ENV_VAR },
      '[plugins-directory] github rejected the configured token; continuing unauthenticated',
    );
  };

  const treeKeyFor = (candidate: ManifestPluginCandidate): string => {
    const location = candidate.location!;
    return `${location.repositoryUrl}@${location.sha ?? location.ref ?? ''}`;
  };

  const needsApiCall = (candidate: ManifestPluginCandidate): boolean =>
    !sharesMarketplaceRepository(candidate) || !sharedTrees.has(treeKeyFor(candidate));

  const reserveApiCall = (candidate: ManifestPluginCandidate): boolean => {
    if (!needsApiCall(candidate)) return true;
    if (run >= cap) return false;
    run += 1;
    return true;
  };

  const marketplaceTree = (candidate: ManifestPluginCandidate): Promise<TreeFetchResult> => {
    const location = candidate.location!;
    const treeKey = treeKeyFor(candidate);
    let shared = sharedTrees.get(treeKey);
    if (!shared) {
      shared = fetchRepositoryTree({ ...location, path: null }, options.fetchImpl, token);
      sharedTrees.set(treeKey, shared);
    }
    return shared;
  };

  const inspectCandidate = async (
    candidate: ManifestPluginCandidate,
  ): Promise<'done' | 'retry'> => {
    const location = candidate.location!;
    let tree: RepositoryTree | undefined;
    if (sharesMarketplaceRepository(candidate)) {
      const shared = await marketplaceTree(candidate);
      if (shared.status === 'unauthorized') {
        dropRejectedToken();
        return 'retry';
      }
      if (shared.status === 'rate-limited') {
        rateLimited = true;
        return 'done';
      }
      if (shared.status !== 'ok') {
        failed += 1;
        return 'done';
      }
      tree = shared.tree;
    }
    const result = await inspectPluginSource(location, {
      fetchImpl: options.fetchImpl,
      token,
      declaredSkills: candidate.plugin.skills ?? [],
      declaredLspServers: Object.keys(candidate.plugin.lspServers ?? {}),
      ...(tree ? { tree } : {}),
      now: options.now,
    });
    if (result.status === 'unauthorized') {
      dropRejectedToken();
      return 'retry';
    }
    if (result.status === 'rate-limited') {
      rateLimited = true;
      return 'done';
    }
    if (result.status === 'failed') {
      failed += 1;
      return 'done';
    }
    inspections[candidate.key!] = result.record;
    return 'done';
  };

  const worker = async (): Promise<void> => {
    while (nextIndex < pending.length && !rateLimited && options.now() < options.deadlineMs) {
      const candidate = pending[nextIndex]!;
      nextIndex += 1;
      if (!reserveApiCall(candidate)) continue;
      let outcome = await inspectCandidate(candidate);
      if (outcome === 'retry' && reserveApiCall(candidate))
        outcome = await inspectCandidate(candidate);
      if (outcome === 'retry') failed += 1;
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(GITHUB_INSPECTION_CONCURRENCY, pending.length) }, worker),
  );
  const resolved = pending.filter((candidate) => candidate.key! in inspections).length;
  return { run, failed, pending: pending.length - resolved, rateLimited };
}

async function fetchDetails(
  cards: readonly PublicDirectoryCard[],
  existingById: ReadonlyMap<string, PluginDirectoryEntry>,
  fetchImpl: DirectoryFetch,
  deadlineMs: number,
  now: Clock,
): Promise<{ details: Map<string, PublicDirectoryDetail>; fetches: number }> {
  const details = new Map<string, PublicDirectoryDetail>();
  let fetches = 0;
  for (const card of cards) {
    const existing = existingById.get(card.slug);
    if (existing && (existing.installCommand || existing.repositoryUrl)) {
      details.set(card.slug, {
        installCommand: existing.installCommand,
        repositoryUrl: existing.repositoryUrl,
      });
      continue;
    }
    if (!card.worksWith.includes(WORKS_WITH_CLAUDE_CODE)) continue;
    if (fetches >= PUBLIC_DIRECTORY_DETAIL_FETCHES_PER_RUN || now() >= deadlineMs) break;
    fetches += 1;
    const detail = await fetchDirectoryDetail(card.slug, fetchImpl);
    if (detail) details.set(card.slug, detail);
    await directoryRequestSpacing();
  }
  return { details, fetches };
}

function countBySource(entries: readonly PluginDirectoryEntry[]): Record<string, number> {
  const counts: Record<string, number> = {
    [SOURCE_FACET_MARKETPLACE]: 0,
    [SOURCE_FACET_PARTNER]: 0,
  };
  for (const entry of entries) counts[entry.sourceFacet] = (counts[entry.sourceFacet] ?? 0) + 1;
  return counts;
}

async function runIngest(
  options: PluginIngestOptions,
  now: Clock,
  startedAtMs: number,
): Promise<PluginIngestSummary> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const runStartedAt = new Date(startedAtMs).toISOString();
  const marketplaces = options.marketplaces ?? DIRECTORY_MARKETPLACES;
  const syncState = options.rebuild ? DEFAULT_PLUGIN_SYNC_STATE : await readPluginSyncState();
  const existing = options.rebuild ? [] : ((await readPluginSnapshotRecords()) ?? []);
  const inspections: PluginInspectionMap = options.rebuild ? {} : await readPluginInspections();
  const existingById = new Map(existing.map((entry) => [entry.id, entry]));

  const manifests = await fetchMarketplaces(
    marketplaces,
    fetchImpl,
    startedAtMs + options.budget.manifestMs,
    now,
  );
  const officialFetched = manifests.fetched.some(
    (marketplace) => marketplace.source.name === OFFICIAL_MARKETPLACE_NAME,
  );
  if (!officialFetched && existing.length === 0) {
    const message = `Marketplace manifest fetch failed: ${manifests.failed.join(', ')}`;
    await writePluginSyncState({ ...syncState, lastError: message });
    throw createError.serviceUnavailable(message);
  }

  const publicResult = await fetchPublicDirectory(
    fetchImpl,
    startedAtMs + options.budget.publicMs,
    now,
  );
  const cards = publicResult.cards.length > 0 ? publicResult.cards : cardsFromExisting(existing);
  const matched = matchCards(cards, manifests.fetched);
  const candidates = candidatesFor(manifests.fetched);
  const inspectionsCached = candidates.filter(
    (candidate) => candidate.key !== null && candidate.key in inspections,
  ).length;

  const inspection = await runInspections(candidates, inspections, {
    token: githubToken(options),
    fetchImpl,
    deadlineMs: startedAtMs + options.budget.inspectionMs,
    now,
  });

  const carried = manifests.failed.flatMap((name) =>
    existing.filter((entry) => entry.marketplace?.name === name && entry.sourceLocation !== null),
  );
  const knownSlugs = new Set([
    ...[...matched.values()].map((card) => card.slug),
    ...candidates.map((candidate) => candidate.plugin.name),
    ...carried.flatMap((entry) => [entry.id, entry.slug]),
  ]);
  const publicOnlyCards = cards.filter((card) => !knownSlugs.has(card.slug));
  const details = await fetchDetails(
    publicOnlyCards,
    existingById,
    fetchImpl,
    startedAtMs + options.budget.totalMs,
    now,
  );

  const firstSeenAt: Record<string, string> = {};
  const firstSeenFor = (id: string): string => {
    const seen = syncState.firstSeenAt[id] ?? existingById.get(id)?.createdAt ?? runStartedAt;
    firstSeenAt[id] = seen;
    return seen;
  };

  const layers = manifests.fetched.map((marketplace) =>
    candidates
      .filter((candidate) => candidate.marketplace === marketplace)
      .map((candidate) =>
        marketplaceDirectoryEntry({
          plugin: candidate.plugin,
          marketplace,
          location: candidate.location,
          inspection: candidate.key ? (inspections[candidate.key] ?? null) : null,
          card: matched.get(candidate.plugin.name) ?? null,
          firstSeenAt: firstSeenFor(candidate.plugin.name),
          now: runStartedAt,
        }),
      ),
  );
  const publicOnly = publicOnlyCards.map((card) =>
    publicOnlyDirectoryEntry({
      card,
      detail: details.details.get(card.slug) ?? null,
      firstSeenAt: firstSeenFor(card.slug),
      now: runStartedAt,
    }),
  );
  const merged = mergeDirectoryEntries(...layers, carried, publicOnly);

  const referencedKeys = new Set(candidates.map((candidate) => candidate.key));
  const prunedInspections: PluginInspectionMap = Object.fromEntries(
    Object.entries(inspections).filter(([key]) => referencedKeys.has(key)),
  );
  await writePluginSnapshotRecords(merged.entries);
  await writePluginInspections(prunedInspections);
  const officialHash =
    manifests.fetched.find((marketplace) => marketplace.source.name === OFFICIAL_MARKETPLACE_NAME)
      ?.contentHash ?? syncState.lastManifestHash;
  await writePluginSyncState({
    lastSyncAt: runStartedAt,
    lastManifestHash: officialHash,
    lastError:
      manifests.failed.length > 0
        ? `Marketplace manifest fetch failed: ${manifests.failed.join(', ')}`
        : null,
    firstSeenAt: Object.fromEntries(
      merged.entries.map((entry) => [entry.id, firstSeenAt[entry.id] ?? entry.createdAt]),
    ),
  });

  const skipped = manifests.fetched.reduce(
    (total, marketplace) => total + marketplace.manifest.skipped.length,
    0,
  );
  if (skipped > 0) {
    logger.warn(
      {
        skipped,
        sample: manifests.fetched
          .flatMap((marketplace) => marketplace.manifest.skipped)
          .slice(0, PLUGIN_DIRECTORY_FAILURE_SAMPLE_SIZE),
      },
      '[plugins-directory] manifest plugins skipped as malformed',
    );
  }
  if (inspection.rateLimited) {
    logger.warn(
      { pending: inspection.pending },
      '[plugins-directory] github rate limit reached; inspections resume next run',
    );
  }

  return {
    marketplacesFetched: manifests.fetched.length,
    marketplacesFailed: manifests.failed,
    manifestPlugins: candidates.length,
    manifestPluginsSkipped: skipped,
    publicCards: publicResult.cards.length,
    publicComplete: publicResult.complete,
    publicMatched: matched.size,
    publicOnly: publicOnly.length,
    detailFetches: details.fetches,
    inspectionsRun: inspection.run,
    inspectionsCached,
    inspectionsFailed: inspection.failed,
    inspectionsPending: inspection.pending,
    rateLimited: inspection.rateLimited,
    verified: merged.entries.filter((entry) => entry.verified).length,
    withInstalls: merged.entries.filter((entry) => entry.installs !== null).length,
    webInstallable: merged.entries.filter((entry) => entry.runtime.webInstallable).length,
    duplicatesDropped: merged.duplicatesDropped,
    bySource: countBySource(merged.entries),
    totalRecords: merged.entries.length,
    wroteSnapshot: true,
    durationMs: now() - startedAtMs,
  };
}
