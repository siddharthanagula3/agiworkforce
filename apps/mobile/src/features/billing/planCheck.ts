export type PlanCheck = 'confirmed' | 'checking' | 'unconfirmed';

/**
 * The tier store starts every account on the Free tier so that admission stays
 * conservative, but that default is not an answer from the server. Only a
 * completed refresh confirms which plan the account holds.
 */
export function planCheckOf(state: {
  lastRefreshedAt: string | null;
  isRefreshing: boolean;
}): PlanCheck {
  if (state.lastRefreshedAt !== null) return 'confirmed';
  return state.isRefreshing ? 'checking' : 'unconfirmed';
}
