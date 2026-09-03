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

export function isBillingPolicyReady(state: BillingPolicyHydrationState): boolean {
  if (state.unauthenticated === true) return false;
  return (
    state.subscription !== null || (state.initialized && !state.isLoading && state.error === null)
  );
}
