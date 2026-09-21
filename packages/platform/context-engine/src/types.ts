import type {
  ContextRetention,
  ContextSensitivity,
  ContextSource,
  ContextSourceClass,
  ContextTrustLevel,
} from '@agiworkforce/context';

export interface ContextActor {
  readonly userId: string;
  readonly organizationId: string | null;
  readonly projectId?: string | null;
  /** A project several members share: nothing personal may be drawn into it. */
  readonly sharedProject?: boolean;
}

export const CONTEXT_EXCLUSION_REASONS = [
  'source_disabled',
  'temporary_chat',
  'personal_scope',
  'permission_denied',
  'policy_denied',
  'budget_exhausted',
  'duplicate_fact',
  'stale',
] as const;

export type ContextExclusionReason = (typeof CONTEXT_EXCLUSION_REASONS)[number];

export type ContextScope = 'global' | 'project' | 'workspace';

export const CONTEXT_VERSION_KEYS = [
  'policy',
  'memory',
  'project',
  'retrieval',
  'promptTemplate',
] as const;

export type ContextVersionKey = (typeof CONTEXT_VERSION_KEYS)[number];

export type ContextVersions = { readonly [K in ContextVersionKey]: string };

export const UNVERSIONED_CONTEXT: ContextVersions = {
  policy: '0',
  memory: '0',
  project: '0',
  retrieval: '0',
  promptTemplate: '0',
};

/** Bumped whenever the assembly order, the checks or the budgeting change. */
export const CONTEXT_ASSEMBLER_VERSION = '2';

export interface ContextTokenBudget {
  readonly maxInputTokens: number;
  readonly reservedOutputTokens: number;
  estimate(text: string): number;
}

export function contextInputCeiling(budget: ContextTokenBudget): number {
  return Math.max(0, Math.floor(budget.maxInputTokens) - Math.floor(budget.reservedOutputTokens));
}

export interface ContextCandidate {
  readonly source: ContextSource;
  readonly text: string;
  readonly capturedAt?: string | null;
}

export interface ResolvedContextItem extends ContextCandidate {
  readonly stale: boolean;
  readonly compacted: boolean;
}

export interface ContextSourceLoader {
  readonly sourceClass: ContextSourceClass;
  /** The ceiling this source alone may spend, independent of the request budget. */
  readonly budgetChars: number;
  /** Older than this and the item is stale; absent means this class never goes stale. */
  readonly freshnessMs?: number;
  /** Stale items are dropped rather than passed to the model marked stale. */
  readonly dropStale?: boolean;
  /** Truncate to what is left of the request budget rather than drop the source. */
  readonly compactable?: boolean;
  load(actor: ContextActor): Promise<readonly ContextCandidate[]> | readonly ContextCandidate[];
}

export interface ContextExclusionCount {
  readonly reason: ContextExclusionReason;
  readonly count: number;
}

export interface ContextManifestEntry {
  readonly sourceClass: ContextSourceClass;
  readonly scope: ContextScope;
  readonly trust: ContextTrustLevel;
  readonly sensitivity: ContextSensitivity;
  readonly retention: ContextRetention;
  readonly explanation: string;
  readonly candidateCount: number;
  readonly includedCount: number;
  readonly staleCount: number;
  readonly budgetChars: number;
  readonly budgetUsedChars: number;
  readonly tokenEstimate: number;
  readonly excluded: readonly ContextExclusionCount[];
  /** Passed every permission and policy check, whether or not the budget took it. */
  readonly eligibleSourceIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly excludedSourceIds: readonly string[];
  readonly compactedSourceIds: readonly string[];
  readonly failed: boolean;
}

/**
 * Identities, counts and budgets, never the text: a manifest is kept so a turn
 * can be explained, which never needs a second copy of the content itself.
 */
export interface ContextManifest {
  readonly manifestId: string;
  readonly turnId: string;
  readonly assemblerVersion: string;
  readonly createdAt: string;
  readonly actor: ContextActor;
  readonly versions: ContextVersions;
  readonly temporaryChat: boolean;
  readonly entries: readonly ContextManifestEntry[];
  readonly includedCount: number;
  readonly budgetUsedChars: number;
  readonly tokenEstimate: number;
  /** What the provider reported afterwards; null until a turn reports it. */
  readonly actualTokenCount: number | null;
  readonly budgetTokens: number | null;
  readonly reservedOutputTokens: number | null;
  /** True only when the instruction layers alone did not fit the budget. */
  readonly overBudget: boolean;
  readonly contentDigest: string;
}

export interface ContextManifestStore {
  write(manifest: ContextManifest): Promise<void>;
  read(turnId: string, actor: Pick<ContextActor, 'userId'>): Promise<ContextManifest | null>;
}
