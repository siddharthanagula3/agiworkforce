/**
 * Tier store for unified-chat.
 *
 * Hosts (apps/desktop, apps/web) push the user's current billing tier here
 * via `setTier()`. Components consume via `useTierStore()` or the helper
 * hooks below to gate Pro+ exclusive features (notably: in-thread
 * multi-provider switch).
 *
 * Defaults to `'byok'` so a host that hasn't wired billing yet still allows
 * full BYOK functionality (BYOK is free forever).
 */
import { create } from 'zustand';
import {
  type UIPlanTier,
  canSwitchProviderInThread,
  isFreePlan,
  tierAtLeast,
} from '@agiworkforce/types';

interface TierState {
  tier: UIPlanTier;
  /** Conversation's first-message provider. Used to detect mid-thread switches. */
  currentConversationProvider: string | null;

  setTier: (tier: UIPlanTier) => void;
  setCurrentConversationProvider: (provider: string | null) => void;
}

export const useTierStore = create<TierState>()((set) => ({
  tier: 'byok',
  currentConversationProvider: null,

  setTier: (tier) => set({ tier }),
  setCurrentConversationProvider: (currentConversationProvider) =>
    set({ currentConversationProvider }),
}));

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectTier = (state: TierState): UIPlanTier => state.tier;

export const selectCanSwitchProvider = (state: TierState): boolean =>
  canSwitchProviderInThread(state.tier);

export const selectIsFreePlan = (state: TierState): boolean => isFreePlan(state.tier);

/**
 * True iff picking a model from `nextProvider` while `state.currentConversationProvider`
 * is set to a DIFFERENT provider would constitute an in-thread switch. Returns false
 * when no conversation is active OR the providers match.
 */
export function selectIsCrossProviderSwitch(state: TierState, nextProvider: string): boolean {
  const cur = state.currentConversationProvider;
  if (!cur) return false;
  return cur.toLowerCase() !== nextProvider.toLowerCase();
}

/**
 * Gate decision for the in-thread provider switch:
 *  - 'allow'           : user has tier ≥ pro_plus, or no conversation active, or same provider
 *  - 'upgrade-required' : user picked a different provider mid-thread on a non-Pro+ tier
 */
export function selectProviderSwitchGate(
  state: TierState,
  nextProvider: string,
): 'allow' | 'upgrade-required' {
  const isCross = selectIsCrossProviderSwitch(state, nextProvider);
  if (!isCross) return 'allow';
  return canSwitchProviderInThread(state.tier) ? 'allow' : 'upgrade-required';
}

// ── Re-exports for convenience ───────────────────────────────────────────────

export { tierAtLeast, canSwitchProviderInThread, isFreePlan };
export type { UIPlanTier };
