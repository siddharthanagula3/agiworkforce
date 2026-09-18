/**
 * @file provider-state.ts
 * @module @agiworkforce/types/provider-state
 *
 * State a provider keeps on our behalf between calls, and the retention
 * requirement that decides whether it may keep any at all.
 *
 * Until this module existed, `zeroDataRetentionOnly` travelled as a bare
 * boolean from an organization policy through admission into a request, and
 * nothing anywhere said which adapter could honour it or what provider-side
 * state a call would leave behind. A requirement nobody can answer is a
 * requirement that silently becomes optional.
 */

import type { Provider } from './provider';
import {
  providerAdapterHasTrait,
  type ProviderAdapter,
  type ProviderTrait,
} from './provider-adapter';

/** Things a provider holds after a call returns, each with its own teardown. */
export const PROVIDER_STATE_KINDS = [
  'prompt-cache',
  'server-file',
  'response-chain',
  'conversation',
  'batch-job',
] as const;

export type ProviderStateKind = (typeof PROVIDER_STATE_KINDS)[number];

export const DATA_RETENTION_REQUIREMENTS = ['default', 'zero-retention'] as const;

export type DataRetentionRequirement = (typeof DATA_RETENTION_REQUIREMENTS)[number];

export interface ProviderStateHandle {
  readonly provider: Provider;
  readonly kind: ProviderStateKind;
  /** The provider's own id for the state. Never a canonical AGI resource id. */
  readonly providerRef: string;
  readonly createdAtMs: number;
  readonly expiresAtMs?: number;
}

/**
 * The trait an adapter declares when the provider honours a per-request
 * zero-retention instruction. Absent means it does not, which is the safe
 * reading: a requirement is never met by a silence.
 */
export const ZERO_DATA_RETENTION_TRAIT: ProviderTrait = 'zero-data-retention';

/** State kinds a trait implies, so the teardown list is derived, not declared twice. */
const STATE_KIND_TRAITS: Readonly<Partial<Record<ProviderStateKind, ProviderTrait>>> = {
  'server-file': 'server-side-file-store',
};

export function adapterMeetsRetentionRequirement(
  adapter: Pick<ProviderAdapter, 'traits'>,
  requirement: DataRetentionRequirement,
): boolean {
  if (requirement === 'default') return true;
  return providerAdapterHasTrait(adapter, ZERO_DATA_RETENTION_TRAIT);
}

export interface RetentionDenial {
  readonly requirement: DataRetentionRequirement;
  readonly reason: string;
}

/**
 * Null when the route may be taken. A denial is returned rather than thrown so
 * the router can try the next candidate instead of failing the turn.
 */
export function retentionDenial(
  adapter: Pick<ProviderAdapter, 'id' | 'traits'>,
  requirement: DataRetentionRequirement,
): RetentionDenial | null {
  if (adapterMeetsRetentionRequirement(adapter, requirement)) return null;
  return {
    requirement,
    reason: `${adapter.id} does not declare the ${ZERO_DATA_RETENTION_TRAIT} trait`,
  };
}

/**
 * The state a call will leave behind, which is what has to be torn down when
 * the requirement is zero retention and the user deletes the conversation.
 */
export function providerStateKindsFor(
  adapter: Pick<ProviderAdapter, 'traits'>,
  intent: { readonly usesPromptCache?: boolean; readonly uploadsFiles?: boolean },
): ProviderStateKind[] {
  const kinds: ProviderStateKind[] = [];
  if (intent.usesPromptCache) kinds.push('prompt-cache');
  if (intent.uploadsFiles) {
    const trait = STATE_KIND_TRAITS['server-file'];
    if (trait !== undefined && providerAdapterHasTrait(adapter, trait)) kinds.push('server-file');
  }
  return kinds;
}

export function isProviderStateKind(value: string): value is ProviderStateKind {
  return (PROVIDER_STATE_KINDS as readonly string[]).includes(value);
}

export function isDataRetentionRequirement(value: string): value is DataRetentionRequirement {
  return (DATA_RETENTION_REQUIREMENTS as readonly string[]).includes(value);
}

export function retentionRequirementFor(
  zeroDataRetentionOnly: boolean | undefined,
): DataRetentionRequirement {
  return zeroDataRetentionOnly === true ? 'zero-retention' : 'default';
}
