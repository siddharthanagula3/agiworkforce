/**
 * Pricing store - Manages plan state for feature gating
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../lib/tauri-mock';
import type { PricingPlan } from '../types/pricing';

interface PricingState {
  // Plans
  currentPlan: PricingPlan | null;
  plansLoading: boolean;

  // Error state
  error: string | null;

  // Actions
  fetchCurrentPlan: (userId: string) => Promise<void>;
  reset: () => void;
}

export const usePricingStore = create<PricingState>()(
  immer((set) => ({
    // Initial State
    currentPlan: null,
    plansLoading: false,
    error: null,

    // Actions
    fetchCurrentPlan: async (userId: string) => {
      set({ plansLoading: true, error: null });
      try {
        const plan = await invoke<PricingPlan>('get_current_plan', { userId });
        set({ currentPlan: plan, plansLoading: false });
      } catch (error) {
        console.error('Failed to fetch current plan:', error);
        set({ error: String(error), plansLoading: false });
      }
    },

    reset: () => {
      set({
        currentPlan: null,
        plansLoading: false,
        error: null,
      });
    },
  })),
);

// Selectors
export const selectCurrentPlan = (state: PricingState) => state.currentPlan;
export const selectPlansLoading = (state: PricingState) => state.plansLoading;
export const selectError = (state: PricingState) => state.error;
