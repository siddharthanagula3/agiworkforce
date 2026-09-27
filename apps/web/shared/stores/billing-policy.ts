export interface BillingPolicyHydrationState {
  initialized: boolean;
  isLoading: boolean;
  error: string | null;
  subscription: unknown | null;
  unauthenticated?: boolean;
}

export function isBillingPolicyReady(state: BillingPolicyHydrationState): boolean {
  if (state.unauthenticated === true) return false;
  return (
    state.subscription !== null || (state.initialized && !state.isLoading && state.error === null)
  );
}
