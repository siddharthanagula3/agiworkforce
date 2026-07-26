export interface BillingPolicyHydrationState {
  initialized: boolean;
  subscription: unknown | null;
}

/**
 * A non-null subscription can be trusted immediately (including preloaded test
 * and app-shell state). Otherwise wait until `/api/me` has resolved before
 * enforcing Free-tier fallbacks that mutate persisted model/composer choices.
 */
export function isBillingPolicyReady(state: BillingPolicyHydrationState): boolean {
  return state.initialized || state.subscription !== null;
}
