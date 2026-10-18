'use client';

import { create } from 'zustand';
import { classifyManagedQuotaErrorCode } from '@agiworkforce/types';

interface FreeTrialState {
  limitReached: boolean;
  markLimitReached: () => void;
  clearLimitReached: () => void;
}

export function isFreeTrialErrorCode(code: string | undefined): boolean {
  return classifyManagedQuotaErrorCode(code)?.kind === 'free_trial';
}

export const useFreeTrialStore = create<FreeTrialState>()((set) => ({
  limitReached: false,
  markLimitReached: () => set({ limitReached: true }),
  clearLimitReached: () => set({ limitReached: false }),
}));
