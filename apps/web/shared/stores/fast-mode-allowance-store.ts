import { create } from 'zustand';

interface FastModeAllowance {
  allowed: boolean;
  setAllowed: (allowed: boolean) => void;
}

/** Whether this account may use fast mode right now. Held in memory only. */
export const useFastModeAllowanceStore = create<FastModeAllowance>((set) => ({
  allowed: false,
  setAllowed: (allowed) => set({ allowed }),
}));
