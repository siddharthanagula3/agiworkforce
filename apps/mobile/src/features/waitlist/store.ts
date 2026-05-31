import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import type { JoinWaitlistInput, JoinWaitlistResult } from './service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WaitlistState {
  joined: boolean;
  email?: string;
  country?: string;
  rank?: number;
  joinedAt?: string;
  cloudUnlocked: boolean;
  inviteId?: string;
  inviteCode?: string;
  cloudUnlockedAt?: string;

  /**
   * Called after `joinWaitlist()` resolves successfully.
   * Records the submission and result, and timestamps the join.
   */
  markJoined: (
    submission: Pick<JoinWaitlistInput, 'email' | 'country'>,
    result: JoinWaitlistResult,
  ) => void;

  /** Called after invite-code redemption unlocks Cloud Managed private beta access. */
  markInviteRedeemed: (redemption: { code: string; inviteId?: string }) => void;

  /** Clears all waitlist state (e.g. when switching accounts or resetting app). */
  clear: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWaitlistStore = create<WaitlistState>()(
  persist(
    (set) => ({
      joined: false,
      cloudUnlocked: false,

      markJoined: (submission, result) =>
        set({
          joined: true,
          email: submission.email,
          country: submission.country,
          rank: result.rank,
          joinedAt: new Date().toISOString(),
        }),

      markInviteRedeemed: (redemption) =>
        set({
          cloudUnlocked: true,
          inviteId: redemption.inviteId,
          inviteCode: redemption.code.trim().toUpperCase(),
          cloudUnlockedAt: new Date().toISOString(),
        }),

      clear: () =>
        set({
          joined: false,
          email: undefined,
          country: undefined,
          rank: undefined,
          joinedAt: undefined,
          cloudUnlocked: false,
          inviteId: undefined,
          inviteCode: undefined,
          cloudUnlockedAt: undefined,
        }),
    }),
    {
      name: 'waitlist-store',
      storage: createJSONStorage(() => mmkvStorage),
      // AUDIT-FIX: MMKV-RACE — defer rehydration until encrypted MMKV is open.
      skipHydration: true,
      partialize: (state) => ({
        joined: state.joined,
        email: state.email,
        country: state.country,
        rank: state.rank,
        joinedAt: state.joinedAt,
        cloudUnlocked: state.cloudUnlocked,
        inviteId: state.inviteId,
        inviteCode: state.inviteCode,
        cloudUnlockedAt: state.cloudUnlockedAt,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[waitlistStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useWaitlistStore, 'waitlist-store');
