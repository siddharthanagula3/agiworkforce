import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../lib/tauri-mock';
import type { PricingPlan } from '../types/pricing';

interface PricingState {
  currentPlan: PricingPlan | null;
  plansLoading: boolean;

  error: string | null;

  fetchCurrentPlan: (userId: string) => Promise<void>;
  reset: () => void;
}

export const usePricingStore = create<PricingState>()(
  immer((set) => ({
    currentPlan: null,
    plansLoading: false,
    error: null,

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

export const selectCurrentPlan = (state: PricingState) => state.currentPlan;
export const selectPlansLoading = (state: PricingState) => state.plansLoading;
export const selectError = (state: PricingState) => state.error;
