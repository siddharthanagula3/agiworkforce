export interface BillingPolicyHydrationState {
  initialized: boolean;
  isLoading: boolean;
  error: string | null;
  subscription: unknown | null;
}

/**
 * A non-null subscription can be trusted immediately (including preloaded test
 * and app-shell state). Otherwise require a successful `/api/me` resolution
 * before enforcing Free-tier fallbacks that mutate persisted model/composer
 * choices. A failed account request is unknown, not proof that the user is on
 * Free; treating it as Free creates false upgrade gates during an outage.
 */
export function isBillingPolicyReady(state: BillingPolicyHydrationState): boolean {
  return (
    state.subscription !== null || (state.initialized && !state.isLoading && state.error === null)
  );
}
