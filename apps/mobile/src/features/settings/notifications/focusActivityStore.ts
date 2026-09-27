import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import type { BreakReminderMinutes } from '@agiworkforce/types';

const MAX_DAILY_ACTIVE_MS = 24 * 60 * 60_000;

interface FocusActivityState {
  dateKey: string | null;
  activeMs: number;
  dismissedBreakMinutes: BreakReminderMinutes | null;
  quietWindowAcknowledged: string | null;
  recordActive: (dateKey: string, elapsedMs: number) => number;
  dismissBreak: (dateKey: string, minutes: BreakReminderMinutes) => void;
  acknowledgeQuietWindow: (windowKey: string) => void;
}

export const useFocusActivityStore = create<FocusActivityState>()(
  persist(
    (set, get) => ({
      dateKey: null,
      activeMs: 0,
      dismissedBreakMinutes: null,
      quietWindowAcknowledged: null,
      recordActive: (dateKey, elapsedMs) => {
        const current = get();
        const sameDay = current.dateKey === dateKey;
        const activeMs = Math.min(
          MAX_DAILY_ACTIVE_MS,
          (sameDay ? current.activeMs : 0) + Math.max(0, elapsedMs),
        );
        set({
          dateKey,
          activeMs,
          dismissedBreakMinutes: sameDay ? current.dismissedBreakMinutes : null,
        });
        return activeMs;
      },
      dismissBreak: (dateKey, minutes) =>
        set((state) => (state.dateKey === dateKey ? { dismissedBreakMinutes: minutes } : state)),
      acknowledgeQuietWindow: (windowKey) => set({ quietWindowAcknowledged: windowKey }),
    }),
    {
      name: 'focus-activity-store',
      storage: createJSONStorage(() => mmkvStorage),
      version: 1,
      skipHydration: true,
    },
  ),
);

rehydrateWhenMmkvReady(useFocusActivityStore, 'focus-activity-store');
