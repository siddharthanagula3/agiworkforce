'use client';

import { create } from 'zustand';
import type { PaywallSlot } from '../types/message-metadata';

export type FreeTrialErrorCode =
  | 'free_trial_token_budget_reached'
  | 'free_trial_model_only'
  | 'free_trial_feature_unavailable';

interface FreeTrialState {
  /** Server-reported exhaustion only. Exact usage and limits remain private. */
  limitReached: boolean;
  markLimitReached: () => void;
  clearLimitReached: () => void;
}

export function isFreeTrialErrorCode(code: string | undefined): code is FreeTrialErrorCode {
  return (
    code === 'free_trial_token_budget_reached' ||
    code === 'free_trial_model_only' ||
    code === 'free_trial_feature_unavailable'
  );
}

export function buildFreeTrialPaywallSlot(
  code: FreeTrialErrorCode,
  fallbackReason?: string,
): PaywallSlot {
  const defaultReason =
    code === 'free_trial_token_budget_reached'
      ? 'You have reached the current free usage limit. Upgrade for more hosted capacity.'
      : code === 'free_trial_model_only'
        ? 'That model requires a paid plan. Choose a free model or upgrade.'
        : 'That capability requires a paid plan.';

  return {
    feature:
      code === 'free_trial_token_budget_reached'
        ? 'token_cap'
        : code === 'free_trial_model_only'
          ? 'model_access'
          : 'paid_capability',
    requiredTier: 'hobby',
    reason: fallbackReason || defaultReason,
  };
}

export const useFreeTrialStore = create<FreeTrialState>()((set) => ({
  limitReached: false,
  markLimitReached: () => set({ limitReached: true }),
  clearLimitReached: () => set({ limitReached: false }),
}));
