import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import type { JoinWaitlistInput, JoinWaitlistResult } from './service';

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

  markJoined: (
    submission: Pick<JoinWaitlistInput, 'email' | 'country'>,
    result: JoinWaitlistResult,
  ) => void;

  markInviteRedeemed: (redemption: { code: string; inviteId?: string }) => void;

  setCloudAccess: (unlocked: boolean) => void;

  clear: () => void;
}

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
          rank: result.rank ?? undefined,
          joinedAt: new Date().toISOString(),
        }),

      markInviteRedeemed: (redemption) =>
        set({
          cloudUnlocked: true,
          inviteId: redemption.inviteId,
          inviteCode: redemption.code.trim().toUpperCase(),
          cloudUnlockedAt: new Date().toISOString(),
        }),

      setCloudAccess: (unlocked) =>
        set((state) =>
          state.cloudUnlocked === unlocked
            ? state
            : {
                cloudUnlocked: unlocked,
                cloudUnlockedAt: unlocked ? new Date().toISOString() : undefined,
              },
        ),

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
      skipHydration: true,
      partialize: (state) => ({
        joined: state.joined,
        email: state.email,
        country: state.country,
        rank: state.rank,
        joinedAt: state.joinedAt,
      }),
      // Legacy blobs written before that rule still carry the entitlement, so
      // rehydration takes only the signup record and never the cloud grant.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<WaitlistState>;
        return {
          ...current,
          joined: saved.joined === true,
          email: saved.email,
          country: saved.country,
          rank: saved.rank,
          joinedAt: saved.joinedAt,
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[waitlistStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useWaitlistStore, 'waitlist-store');
