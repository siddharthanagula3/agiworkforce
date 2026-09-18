import type { ContextSource, ContextSourceClass } from '@agiworkforce/context';

export interface ContextActor {
  readonly userId: string;
  readonly organizationId: string | null;
  readonly projectId?: string | null;
}

export const CONTEXT_EXCLUSION_REASONS = [
  'permission_denied',
  'policy_denied',
  'budget_exhausted',
  'duplicate_fact',
  'stale',
] as const;

export type ContextExclusionReason = (typeof CONTEXT_EXCLUSION_REASONS)[number];

export type ContextScope = 'global' | 'project' | 'workspace';

export interface ContextCandidate {
  readonly source: ContextSource;
  readonly text: string;
  readonly capturedAt?: string | null;
}

export interface ResolvedContextItem extends ContextCandidate {
  readonly stale: boolean;
}

export interface ContextSourceLoader {
  readonly sourceClass: ContextSourceClass;
  /** The ceiling this source alone may spend, independent of the request budget. */
  readonly budgetChars: number;
  /** Older than this and the item is stale; absent means this class never goes stale. */
  readonly freshnessMs?: number;
  /** Stale items are dropped rather than passed to the model marked stale. */
  readonly dropStale?: boolean;
  load(actor: ContextActor): Promise<readonly ContextCandidate[]> | readonly ContextCandidate[];
}

export interface ContextExclusionCount {
  readonly reason: ContextExclusionReason;
  readonly count: number;
}

export interface ContextManifestEntry {
  readonly sourceClass: ContextSourceClass;
  readonly scope: ContextScope;
  readonly candidateCount: number;
  readonly includedCount: number;
  readonly staleCount: number;
  readonly budgetChars: number;
  readonly budgetUsedChars: number;
  readonly excluded: readonly ContextExclusionCount[];
  readonly sourceIds: readonly string[];
  readonly failed: boolean;
}

/**
 * Identities, counts and budgets, never the text: a manifest is kept so a turn
 * can be explained, which never needs a second copy of the content itself.
 */
export interface ContextManifest {
  readonly turnId: string;
  readonly createdAt: string;
  readonly actor: ContextActor;
  readonly entries: readonly ContextManifestEntry[];
  readonly includedCount: number;
  readonly budgetUsedChars: number;
  readonly contentDigest: string;
}

export interface ContextManifestStore {
  write(manifest: ContextManifest): Promise<void>;
  read(turnId: string, actor: Pick<ContextActor, 'userId'>): Promise<ContextManifest | null>;
}
