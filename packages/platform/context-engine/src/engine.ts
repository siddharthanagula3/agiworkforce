import { createHash } from 'node:crypto';
import type { ContextSourceClass } from '@agiworkforce/context';
import {
  permissionCheck,
  policyCheck,
  type ContextCheck,
  type OrganizationContextPolicy,
} from './permissions';
import type {
  ContextActor,
  ContextCandidate,
  ContextExclusionCount,
  ContextExclusionReason,
  ContextManifest,
  ContextManifestEntry,
  ContextManifestStore,
  ContextScope,
  ContextSourceLoader,
  ResolvedContextItem,
} from './types';

export interface ContextResolution {
  readonly manifest: ContextManifest;
  readonly items: readonly ResolvedContextItem[];
  itemsOf(sourceClass: ContextSourceClass): readonly ResolvedContextItem[];
}

export interface ResolveContextInput {
  readonly turnId: string;
  readonly actor: ContextActor;
  readonly policy: OrganizationContextPolicy;
  readonly loaders: readonly ContextSourceLoader[];
  readonly store?: ContextManifestStore;
  readonly nowMs?: number;
  onLoaderError?: (sourceClass: ContextSourceClass, error: unknown) => void;
}

/** Two sources stating the same fact differently still collide on this key. */
export function factKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function scopeOf(actor: ContextActor, candidates: readonly ContextCandidate[]): ContextScope {
  if (candidates.some((candidate) => candidate.source.provenance.projectId !== undefined)) {
    return 'project';
  }
  return actor.organizationId ? 'workspace' : 'global';
}

function isStale(candidate: ContextCandidate, loader: ContextSourceLoader, nowMs: number): boolean {
  if (loader.freshnessMs === undefined) return false;
  const capturedAt = candidate.capturedAt ?? candidate.source.provenance.capturedAt;
  if (!capturedAt) return false;
  const capturedMs = Date.parse(capturedAt);
  return Number.isFinite(capturedMs) && nowMs - capturedMs > loader.freshnessMs;
}

function countExclusions(
  reasons: readonly ContextExclusionReason[],
): readonly ContextExclusionCount[] {
  const counts = new Map<ContextExclusionReason, number>();
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return [...counts.entries()].map(([reason, count]) => ({ reason, count }));
}

async function loadCandidates(
  loader: ContextSourceLoader,
  input: ResolveContextInput,
): Promise<{ candidates: readonly ContextCandidate[]; failed: boolean }> {
  try {
    return { candidates: await loader.load(input.actor), failed: false };
  } catch (error) {
    input.onLoaderError?.(loader.sourceClass, error);
    return { candidates: [], failed: true };
  }
}

/**
 * Every context source a turn can carry passes through here: the permission and
 * policy checks are the engine's, not each loader's, and what survived is
 * recorded as a manifest the turn can be explained from afterwards.
 */
export async function resolveContext(input: ResolveContextInput): Promise<ContextResolution> {
  const nowMs = input.nowMs ?? Date.now();
  const seenFacts = new Set<string>();
  const items: ResolvedContextItem[] = [];
  const entries: ContextManifestEntry[] = [];

  for (const loader of input.loaders) {
    const { candidates, failed } = await loadCandidates(loader, input);
    const excluded: ContextExclusionReason[] = [];
    const sourceIds: string[] = [];
    let budgetUsedChars = 0;
    let includedCount = 0;
    let staleCount = 0;

    for (const candidate of candidates) {
      const checks: ContextCheck[] = [
        permissionCheck(candidate.source, input.actor),
        policyCheck(candidate.source, input.policy),
      ];
      const refused = checks.find((check): check is Extract<ContextCheck, { allowed: false }> => {
        return !check.allowed;
      });
      if (refused) {
        excluded.push(refused.reason);
        continue;
      }

      const stale = isStale(candidate, loader, nowMs);
      if (stale && loader.dropStale) {
        excluded.push('stale');
        continue;
      }

      const key = factKey(candidate.text);
      if (key && seenFacts.has(key)) {
        excluded.push('duplicate_fact');
        continue;
      }
      if (budgetUsedChars + candidate.text.length > loader.budgetChars) {
        excluded.push('budget_exhausted');
        continue;
      }

      if (key) seenFacts.add(key);
      budgetUsedChars += candidate.text.length;
      includedCount += 1;
      if (stale) staleCount += 1;
      sourceIds.push(candidate.source.id);
      items.push({ ...candidate, stale });
    }

    entries.push({
      sourceClass: loader.sourceClass,
      scope: scopeOf(input.actor, candidates),
      candidateCount: candidates.length,
      includedCount,
      staleCount,
      budgetChars: loader.budgetChars,
      budgetUsedChars,
      excluded: countExclusions(excluded),
      sourceIds,
      failed,
    });
  }

  const manifest: ContextManifest = {
    turnId: input.turnId,
    createdAt: new Date(nowMs).toISOString(),
    actor: input.actor,
    entries,
    includedCount: items.length,
    budgetUsedChars: entries.reduce((total, entry) => total + entry.budgetUsedChars, 0),
    contentDigest: contextContentDigest(items),
  };
  await input.store?.write(manifest);

  return {
    manifest,
    items,
    itemsOf: (sourceClass) => items.filter((item) => item.source.sourceClass === sourceClass),
  };
}

/** Proves a replay assembled the same text without the manifest holding any. */
export function contextContentDigest(items: readonly ResolvedContextItem[]): string {
  const hash = createHash('sha256');
  for (const item of items) hash.update(`${item.source.id}\0${item.text}\0`);
  return hash.digest('hex');
}
