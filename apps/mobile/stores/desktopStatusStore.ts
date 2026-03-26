import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';

/** How recently a heartbeat must be to consider the desktop "online" (ms). */
const ONLINE_THRESHOLD_MS = 90_000;

interface DesktopStatusState {
  /** Whether the desktop surface is currently online (heartbeat within threshold). */
  isOnline: boolean;
  /** ISO timestamp of the last desktop heartbeat, or null if never seen. */
  lastSeenAt: string | null;
  /** Friendly name of the paired desktop (persisted across restarts). */
  desktopName: string | null;
  /** OS platform of the paired desktop, e.g. 'darwin', 'win32', 'linux'. */
  desktopPlatform: string | null;

  setOnline: (online: boolean) => void;
  setLastSeen: (lastSeen: string) => void;
  setDesktopInfo: (name: string, platform?: string) => void;
  reset: () => void;
}

export const useDesktopStatusStore = create<DesktopStatusState>()(
  persist(
    (set) => ({
      isOnline: false,
      lastSeenAt: null,
      desktopName: null,
      desktopPlatform: null,

      setOnline: (online) => set({ isOnline: online }),

      setLastSeen: (lastSeen) => {
        const ts = new Date(lastSeen).getTime();
        const fresh = Date.now() - ts < ONLINE_THRESHOLD_MS;
        set({ lastSeenAt: lastSeen, isOnline: fresh });
      },

      setDesktopInfo: (name, platform) =>
        set({
          desktopName: name,
          ...(platform !== undefined ? { desktopPlatform: platform } : {}),
        }),

      reset: () =>
        set({
          isOnline: false,
          lastSeenAt: null,
          desktopName: null,
          desktopPlatform: null,
        }),
    }),
    {
      name: 'desktop-status-store',
      storage: createJSONStorage(() => mmkvStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[desktopStatusStore] Hydration failed:', error);
      },
      partialize: (state) => ({
        // Only persist identity — liveness is recomputed from heartbeats
        desktopName: state.desktopName,
        desktopPlatform: state.desktopPlatform,
      }),
    },
  ),
);
