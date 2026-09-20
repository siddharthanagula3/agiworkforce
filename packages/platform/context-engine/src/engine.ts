import { createHash } from 'node:crypto';
import {
  CONTEXT_SOURCE_PRECEDENCE,
  contextSourceClassPolicy,
  contextTrustLevel,
  type ContextInvalidationTrigger,
  type ContextSourceClass,
} from '@agiworkforce/context';
import {
  permissionCheck,
  policyCheck,
  type ContextCheck,
  type OrganizationContextPolicy,
} from './permissions';
import {
  CONTEXT_ASSEMBLER_VERSION,
  UNVERSIONED_CONTEXT,
  contextInputCeiling,
  type ContextActor,
  type ContextCandidate,
  type ContextExclusionCount,
  type ContextExclusionReason,
  type ContextManifest,
  type ContextManifestEntry,
  type ContextManifestStore,
  type ContextScope,
  type ContextSourceLoader,
  type ContextTokenBudget,
  type ContextVersions,
  type ResolvedContextItem,
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
  readonly temporaryChat?: boolean;
  /** Toggle keys the user has turned off, as the taxonomy names them. */
  readonly disabledToggles?: readonly string[];
  readonly budget?: ContextTokenBudget;
  readonly versions?: ContextVersions;
  onLoaderError?: (sourceClass: ContextSourceClass, error: unknown) => void;
}

/** Two sources stating the same fact differently still collide on this key. */
export function factKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function contextPrecedenceRank(sourceClass: ContextSourceClass): number {
  return CONTEXT_SOURCE_PRECEDENCE.indexOf(sourceClass);
}

/**
 * One order on every surface and for every model, so the same sources assembled
 * for the same turn produce the same prompt wherever the turn was started.
 */
export function orderContextLoaders(
  loaders: readonly ContextSourceLoader[],
): readonly ContextSourceLoader[] {
  return [...loaders]
    .map((loader, index) => ({ loader, index }))
    .sort(
      (left, right) =>
        contextPrecedenceRank(left.loader.sourceClass) -
          contextPrecedenceRank(right.loader.sourceClass) || left.index - right.index,
    )
    .map((entry) => entry.loader);
}

export function contextClassesInvalidatedBy(
  trigger: ContextInvalidationTrigger,
): readonly ContextSourceClass[] {
  return CONTEXT_SOURCE_PRECEDENCE.filter((sourceClass) =>
    contextSourceClassPolicy(sourceClass).invalidatedBy.includes(trigger),
  );
}

/** Which of a manifest's entries a newer version vector has already outdated. */
export function staleManifestClasses(
  manifest: ContextManifest,
  versions: ContextVersions,
): readonly ContextSourceClass[] {
  const changed = new Set<ContextInvalidationTrigger>();
  if (manifest.versions.policy !== versions.policy) changed.add('policy_changed');
  if (manifest.versions.memory !== versions.memory) changed.add('memory_changed');
  if (manifest.versions.project !== versions.project) changed.add('project_changed');
  if (manifest.versions.retrieval !== versions.retrieval) changed.add('conversation_changed');
  return manifest.entries
    .map((entry) => entry.sourceClass)
    .filter((sourceClass) =>
      contextSourceClassPolicy(sourceClass).invalidatedBy.some((trigger) => changed.has(trigger)),
    );
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

/**
 * Whether the class may enter this turn at all, before any single candidate is
 * looked at: the user's own switch, the temporary boundary, the shared project.
 */
function classAdmission(
  sourceClass: ContextSourceClass,
  input: ResolveContextInput,
): ContextExclusionReason | null {
  const policy = contextSourceClassPolicy(sourceClass);
  const toggle = policy.enabledBy;
  if (
    (toggle.kind === 'user_setting' ||
      toggle.kind === 'project_setting' ||
      toggle.kind === 'device_setting') &&
    input.disabledToggles?.includes(toggle.key)
  ) {
    return 'source_disabled';
  }
  if (input.temporaryChat && policy.excludedFromTemporaryChat) return 'temporary_chat';
  if (input.actor.sharedProject && policy.sensitivity === 'personal') return 'personal_scope';
  return null;
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

function charsForTokens(budget: ContextTokenBudget, tokens: number): number {
  let low = 0;
  let high = tokens * 8 + 8;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (budget.estimate('x'.repeat(middle)) <= tokens) low = middle;
    else high = middle - 1;
  }
  return low;
}

/**
 * Every context source a turn can carry passes through here: the permission,
 * policy and budget checks are the engine's, not each loader's, and what
 * survived is recorded as a manifest the turn can be explained from afterwards.
 */
export async function resolveContext(input: ResolveContextInput): Promise<ContextResolution> {
  const nowMs = input.nowMs ?? Date.now();
  const seenFacts = new Set<string>();
  const items: ResolvedContextItem[] = [];
  const entries: ContextManifestEntry[] = [];
  const ceiling = input.budget ? contextInputCeiling(input.budget) : null;
  let tokensSpent = 0;
  let overBudget = false;

  for (const loader of orderContextLoaders(input.loaders)) {
    const { candidates, failed } = await loadCandidates(loader, input);
    const classPolicy = contextSourceClassPolicy(loader.sourceClass);
    const refusedClass = classAdmission(loader.sourceClass, input);
    const excluded: ContextExclusionReason[] = [];
    const eligibleSourceIds: string[] = [];
    const sourceIds: string[] = [];
    const excludedSourceIds: string[] = [];
    const compactedSourceIds: string[] = [];
    let budgetUsedChars = 0;
    let tokenEstimate = 0;
    let includedCount = 0;
    let staleCount = 0;

    for (const candidate of candidates) {
      if (refusedClass) {
        excluded.push(refusedClass);
        excludedSourceIds.push(candidate.source.id);
        continue;
      }

      const checks: ContextCheck[] = [
        permissionCheck(candidate.source, input.actor),
        policyCheck(candidate.source, input.policy),
      ];
      const refused = checks.find((check): check is Extract<ContextCheck, { allowed: false }> => {
        return !check.allowed;
      });
      if (refused) {
        excluded.push(refused.reason);
        excludedSourceIds.push(candidate.source.id);
        continue;
      }
      eligibleSourceIds.push(candidate.source.id);

      const stale = isStale(candidate, loader, nowMs);
      if (stale && loader.dropStale) {
        excluded.push('stale');
        excludedSourceIds.push(candidate.source.id);
        continue;
      }

      const key = factKey(candidate.text);
      if (key && seenFacts.has(key)) {
        excluded.push('duplicate_fact');
        excludedSourceIds.push(candidate.source.id);
        continue;
      }
      if (budgetUsedChars + candidate.text.length > loader.budgetChars) {
        excluded.push('budget_exhausted');
        excludedSourceIds.push(candidate.source.id);
        continue;
      }

      let text = candidate.text;
      let compacted = false;
      if (input.budget && ceiling !== null) {
        const remaining = ceiling - tokensSpent;
        let tokens = input.budget.estimate(text);
        if (tokens > remaining && !classPolicy.isInstruction) {
          if (!loader.compactable || remaining <= 0) {
            excluded.push('budget_exhausted');
            excludedSourceIds.push(candidate.source.id);
            continue;
          }
          text = text.slice(0, charsForTokens(input.budget, remaining));
          tokens = input.budget.estimate(text);
          compacted = true;
          if (!text) {
            excluded.push('budget_exhausted');
            excludedSourceIds.push(candidate.source.id);
            continue;
          }
        }
        tokensSpent += tokens;
        tokenEstimate += tokens;
        if (tokensSpent > ceiling) overBudget = true;
      }

      if (key) seenFacts.add(key);
      budgetUsedChars += text.length;
      includedCount += 1;
      if (stale) staleCount += 1;
      if (compacted) compactedSourceIds.push(candidate.source.id);
      sourceIds.push(candidate.source.id);
      items.push({ ...candidate, text, stale, compacted });
    }

    entries.push({
      sourceClass: loader.sourceClass,
      scope: scopeOf(input.actor, candidates),
      trust: contextTrustLevel(classPolicy),
      sensitivity: classPolicy.sensitivity,
      retention: classPolicy.retention,
      explanation: classPolicy.explanation,
      candidateCount: candidates.length,
      includedCount,
      staleCount,
      budgetChars: loader.budgetChars,
      budgetUsedChars,
      tokenEstimate,
      excluded: countExclusions(excluded),
      eligibleSourceIds,
      sourceIds,
      excludedSourceIds,
      compactedSourceIds,
      failed,
    });
  }

  const contentDigest = contextContentDigest(items);
  const createdAt = new Date(nowMs).toISOString();
  const manifest: ContextManifest = {
    manifestId: contextManifestId({
      turnId: input.turnId,
      userId: input.actor.userId,
      createdAt,
      contentDigest,
    }),
    turnId: input.turnId,
    assemblerVersion: CONTEXT_ASSEMBLER_VERSION,
    createdAt,
    actor: input.actor,
    versions: input.versions ?? UNVERSIONED_CONTEXT,
    temporaryChat: input.temporaryChat === true,
    entries,
    includedCount: items.length,
    budgetUsedChars: entries.reduce((total, entry) => total + entry.budgetUsedChars, 0),
    tokenEstimate: entries.reduce((total, entry) => total + entry.tokenEstimate, 0),
    actualTokenCount: null,
    budgetTokens: ceiling,
    reservedOutputTokens: input.budget ? Math.floor(input.budget.reservedOutputTokens) : null,
    overBudget,
    contentDigest,
  };
  await input.store?.write(manifest);

  return {
    manifest,
    items,
    itemsOf: (sourceClass) => items.filter((item) => item.source.sourceClass === sourceClass),
  };
}

/** The count the provider reported, recorded against the estimate that drove the turn. */
export function withActualTokenCount(
  manifest: ContextManifest,
  actualTokenCount: number,
): ContextManifest {
  return { ...manifest, actualTokenCount: Math.max(0, Math.floor(actualTokenCount)) };
}

/** Derived, not random, so a replay of one turn lands on the same manifest id. */
export function contextManifestId(input: {
  turnId: string;
  userId: string;
  createdAt: string;
  contentDigest: string;
}): string {
  return createHash('sha256')
    .update(`${input.turnId}\0${input.userId}\0${input.createdAt}\0${input.contentDigest}`)
    .digest('hex')
    .slice(0, 32);
}

/** Proves a replay assembled the same text without the manifest holding any. */
export function contextContentDigest(items: readonly ResolvedContextItem[]): string {
  const hash = createHash('sha256');
  for (const item of items) hash.update(`${item.source.id}\0${item.text}\0`);
  return hash.digest('hex');
}
