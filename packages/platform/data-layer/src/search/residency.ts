import { searchModeDeclaration, type SearchMode } from './types';

export type SearchResidencyRefusal =
  'region_not_provisioned' | 'region_unverified' | 'cross_region';

/**
 * `origin` is null when the caller could not read the workspace's pin, which is
 * a refusal rather than a pass: an unknown region is not the home region.
 */
export interface SearchResidencyState {
  origin: string | null;
  executing: string;
  provisioned: boolean;
  missing: readonly string[];
}

export type SearchResidencyDecision =
  { allowed: true } | { allowed: false; refusal: SearchResidencyRefusal; reason: string };

export function searchResidencyDecision(
  mode: SearchMode,
  state: SearchResidencyState,
): SearchResidencyDecision {
  if (searchModeDeclaration(mode).residency === 'external_egress') return { allowed: true };
  if (state.origin === null) {
    return {
      allowed: false,
      refusal: 'region_unverified',
      reason:
        `Mode "${mode}" is pinned to its workspace's data region and the region could not be ` +
        'read, so the query is refused rather than served from the region that happens to answer.',
    };
  }
  if (!state.provisioned) {
    return {
      allowed: false,
      refusal: 'region_not_provisioned',
      reason:
        `Data region "${state.origin}" is not provisioned${
          state.missing.length > 0 ? ` (${state.missing.join(', ')} unset)` : ''
        }, so "${mode}" results cannot be served from it. Falling back to "${state.executing}" ` +
        'would move the workspace, which residency exists to prevent.',
    };
  }
  if (state.origin !== state.executing) {
    return {
      allowed: false,
      refusal: 'cross_region',
      reason:
        `A "${mode}" query for a workspace in data region "${state.origin}" cannot be answered ` +
        `from the store in "${state.executing}". The query waits for its own region.`,
    };
  }
  return { allowed: true };
}

export class SearchResidencyError extends Error {
  readonly mode: SearchMode;
  readonly refusal: SearchResidencyRefusal;
  readonly origin: string | null;
  readonly executing: string;
  readonly missing: readonly string[];

  constructor(
    mode: SearchMode,
    state: SearchResidencyState,
    decision: Extract<SearchResidencyDecision, { allowed: false }>,
  ) {
    super(decision.reason);
    this.name = 'SearchResidencyError';
    this.mode = mode;
    this.refusal = decision.refusal;
    this.origin = state.origin;
    this.executing = state.executing;
    this.missing = state.missing;
  }
}

export function assertSearchResidency(mode: SearchMode, state: SearchResidencyState): void {
  const decision = searchResidencyDecision(mode, state);
  if (decision.allowed) return;
  throw new SearchResidencyError(mode, state, decision);
}
