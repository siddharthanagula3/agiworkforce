export interface BillingPolicyHydrationState {
  initialized: boolean;
  isLoading: boolean;
  error: string | null;
  subscription: unknown | null;
  /**
   * Set when `/api/me` answered 401. Optional so hand-built states in tests and
   * the app shell stay valid; absent is treated as "not known to be signed out".
   */
  unauthenticated?: boolean;
}

/**
 * A non-null subscription can be trusted immediately (including preloaded test
 * and app-shell state). Otherwise require a successful `/api/me` resolution
 * before enforcing Free-tier fallbacks that mutate persisted model/composer
 * choices. A failed account request is unknown, not proof that the user is on
 * Free; treating it as Free creates false upgrade gates during an outage.
 *
 * `unauthenticated` is part of that test and not an extra nicety. The 401 path
 * in `web-auth-store` clears `subscription` to null, sets `initialized`, and
 * deliberately records NO error, so a check of
 * `initialized && !isLoading && error === null` returns true on exactly the
 * case this function exists to exclude. Observed in the running app: a Max 15x
 * subscriber opened Upgrade and was shown Free marked "Your current plan" with
 * an "Upgrade to Basic, $7/month" button, i.e. a downgrade sold as an upgrade.
 */
export function isBillingPolicyReady(state: BillingPolicyHydrationState): boolean {
  if (state.unauthenticated === true) return false;
  return (
    state.subscription !== null || (state.initialized && !state.isLoading && state.error === null)
  );
}
