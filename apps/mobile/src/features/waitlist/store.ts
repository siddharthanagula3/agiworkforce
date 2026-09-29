import { create } from 'zustand';
import { mmkvStorage, whenMmkvReady } from '@/lib/mmkv';

const LEGACY_SIGNUP_RECORD_KEY = 'waitlist-store';

interface WaitlistState {
  cloudUnlocked: boolean;
  cloudUnlockedAt?: string;

  setCloudAccess: (unlocked: boolean) => void;

  clear: () => void;
}

export const useWaitlistStore = create<WaitlistState>()((set) => ({
  cloudUnlocked: false,

  setCloudAccess: (unlocked) =>
    set((state) =>
      state.cloudUnlocked === unlocked
        ? state
        : {
            cloudUnlocked: unlocked,
            cloudUnlockedAt: unlocked ? new Date().toISOString() : undefined,
          },
    ),

  clear: () => set({ cloudUnlocked: false, cloudUnlockedAt: undefined }),
}));

whenMmkvReady(() => {
  void mmkvStorage.removeItem(LEGACY_SIGNUP_RECORD_KEY);
});
