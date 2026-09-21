import { create } from 'zustand';
import {
  type UIPlanTier,
  canAccessAutoRoutingProfileForTier,
  canSwitchProviderInThread,
  getDefaultModelFor,
  isAutoModeModelId,
  isFreePlan,
  tierAtLeast,
} from '@agiworkforce/types';

import { useModelStore } from './modelStore';

interface TierState {
  tier: UIPlanTier;
  currentConversationProvider: string | null;

  setTier: (tier: UIPlanTier) => void;
  setCurrentConversationProvider: (provider: string | null) => void;
}

// A persisted `auto` on a plan that cannot select Auto moves to that plan's
// default once the plan is known; any other selection is left as the user left it.
function reconcileSelectionWithTier(tier: UIPlanTier): void {
  const { selectedModelId, selectModel } = useModelStore.getState();
  if (!isAutoModeModelId(selectedModelId)) return;
  if (canAccessAutoRoutingProfileForTier(selectedModelId, tier)) return;
  selectModel(getDefaultModelFor(tier, 'chat'));
}

export const useTierStore = create<TierState>()((set) => ({
  tier: 'byok',
  currentConversationProvider: null,

  setTier: (tier) => {
    set({ tier });
    reconcileSelectionWithTier(tier);
  },
  setCurrentConversationProvider: (currentConversationProvider) =>
    set({ currentConversationProvider }),
}));

export const selectTier = (state: TierState): UIPlanTier => state.tier;

export const selectCanSwitchProvider = (state: TierState): boolean =>
  canSwitchProviderInThread(state.tier);

export const selectIsFreePlan = (state: TierState): boolean => isFreePlan(state.tier);

export function selectIsCrossProviderSwitch(state: TierState, nextProvider: string): boolean {
  const cur = state.currentConversationProvider;
  if (!cur) return false;
  return cur.toLowerCase() !== nextProvider.toLowerCase();
}

export function selectProviderSwitchGate(
  state: TierState,
  nextProvider: string,
): 'allow' | 'upgrade-required' {
  const isCross = selectIsCrossProviderSwitch(state, nextProvider);
  if (!isCross) return 'allow';
  return canSwitchProviderInThread(state.tier) ? 'allow' : 'upgrade-required';
}

export { tierAtLeast, canSwitchProviderInThread, isFreePlan };
export type { UIPlanTier };
