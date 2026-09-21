/**
 * @file lifecycle-semantics.ts
 * @module @agiworkforce/types/lifecycle-semantics
 *
 * What withdrawing a resource promises, per resource that can be withdrawn.
 * `resource-lifecycle.ts` says what the four states mean; this says which
 * tables are in each state, which column spells it, what puts a row back, what
 * eventually collects it, and what happens to a link somebody else is holding.
 * `scripts/check-lifecycle-semantics.mjs` re-derives all of it from the
 * migrations and from every production read, so a promise here that the code
 * does not keep fails the build.
 */

import lifecycleSemanticsJson from './lifecycle-semantics.json' with { type: 'json' };
import type { ResourceLifecycleState } from './resource-lifecycle';

export const WITHDRAWAL_KINDS = ['softDeleted', 'archived'] as const;
export type WithdrawalKind = (typeof WITHDRAWAL_KINDS)[number];

/** What a withdrawal does to a link the owner already handed out. */
export const SHARING_OUTCOMES = ['revoked', 'preserved', 'narrowed'] as const;
export type SharingOutcome = (typeof SHARING_OUTCOMES)[number];

/** Why a production read is allowed to see a withdrawn row. */
export const LIFECYCLE_READ_CLASSES = [
  'erasure',
  'purge',
  'retention-sweep',
  'ownership-check',
  'write-path',
  'tombstone-sync',
  'data-export',
  'tombstone-check',
  'defect',
] as const;
export type LifecycleReadClass = (typeof LIFECYCLE_READ_CLASSES)[number];

export interface LifecycleSharing {
  readonly outcome: SharingOutcome;
  readonly surfaces: readonly string[];
  readonly revokedBy?: string;
}

export interface WithdrawalSemantics {
  readonly column: string;
  readonly restoredBy: string | null;
  readonly purgedBy?: string | null;
  readonly sharing?: LifecycleSharing;
}

export interface LifecycleResource {
  readonly concept: string;
  readonly softDeleted?: WithdrawalSemantics;
  readonly archived?: WithdrawalSemantics;
}

export interface LifecycleReadExemption {
  readonly file: string;
  readonly table: string;
  readonly class: LifecycleReadClass;
  readonly why: string;
  readonly fix?: string;
}

export interface LifecycleRecoveryGap {
  readonly table: string;
  readonly facet: string;
  readonly why: string;
  readonly fix: string;
}

export interface LifecycleSemanticsRegistry {
  readonly markerColumns: Readonly<Record<WithdrawalKind, readonly string[]>>;
  readonly archiveFacets: readonly string[];
  readonly sharingOutcomes: readonly SharingOutcome[];
  readonly predicateHelpers: ReadonlyArray<{
    readonly symbol: string;
    readonly module: string;
    readonly resources: readonly string[];
  }>;
  readonly resources: Readonly<Record<string, LifecycleResource>>;
  readonly recoveryGaps: readonly LifecycleRecoveryGap[];
  readonly readExemptions: readonly LifecycleReadExemption[];
}

export const LIFECYCLE_SEMANTICS = lifecycleSemanticsJson as unknown as LifecycleSemanticsRegistry;

/** The lifecycle state a withdrawal kind puts a row into. */
export const WITHDRAWAL_STATE: Readonly<Record<WithdrawalKind, ResourceLifecycleState>> = {
  softDeleted: 'soft_deleted',
  archived: 'archived',
};

export function lifecycleResource(table: string): LifecycleResource | undefined {
  return LIFECYCLE_SEMANTICS.resources[table];
}

export function withdrawalColumn(table: string, kind: WithdrawalKind): string | null {
  return LIFECYCLE_SEMANTICS.resources[table]?.[kind]?.column ?? null;
}

/**
 * The column a reader of this table owes a predicate for. Soft delete is
 * withdrawn consent, so it outranks archive wherever a table carries both.
 */
export function requiredReadPredicateColumn(table: string): string | null {
  const resource = LIFECYCLE_SEMANTICS.resources[table];
  if (resource === undefined) return null;
  return resource.softDeleted?.column ?? resource.archived?.column ?? null;
}

export function isLifecycleReadClass(value: unknown): value is LifecycleReadClass {
  return (LIFECYCLE_READ_CLASSES as readonly unknown[]).includes(value);
}

/** Reads that are recorded as wrong rather than as deliberate. */
export function recordedLifecycleDefects(): readonly LifecycleReadExemption[] {
  return LIFECYCLE_SEMANTICS.readExemptions.filter((entry) => entry.class === 'defect');
}
