import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { presenceBridge } from '../integrations/realtime';
import type { RealtimeEvent, UserActivity, UserPresence } from '../services/websocketClient';

interface RealtimePresenceState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  userId: string | null;
  teamId: string | null;
  presence: UserPresence[];
  lastEvent: RealtimeEvent | null;
  connect: (userId: string, teamId?: string) => Promise<void>;
  disconnect: () => void;
  refreshPresence: () => Promise<void>;
  updateActivity: (activity: UserActivity) => Promise<void>;
}

export const useRealtimePresenceStore = create<RealtimePresenceState>()(
  devtools(
    (set, get) => ({
      connected: false,
      connecting: false,
      error: null,
      userId: null,
      teamId: null,
      presence: [],
      lastEvent: null,

      connect: async (userId: string, teamId?: string) => {
        set({ connecting: true, error: null });

        try {
          await presenceBridge.connect({
            userId,
            teamId,
            onPresenceChanged: (presence) => {
              set({ presence });
            },
            onEvent: (event) => {
              set({ lastEvent: event });
            },
          });

          set({
            connected: true,
            connecting: false,
            userId,
            teamId: teamId ?? null,
            error: null,
          });
        } catch (error) {
          set({
            connecting: false,
            connected: false,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },

      disconnect: () => {
        presenceBridge.disconnect();
        set({
          connected: false,
          connecting: false,
          userId: null,
          teamId: null,
          presence: [],
          lastEvent: null,
        });
      },

      refreshPresence: async () => {
        const { teamId } = get();
        if (!teamId) {
          set({ presence: [] });
          return;
        }

        const presence = await presenceBridge.refreshTeamPresence();
        set({ presence });
      },

      updateActivity: async (activity: UserActivity) => {
        const { userId } = get();
        if (!userId) {
          return;
        }

        await presenceBridge.updateActivity(userId, activity);
      },
    }),
    { name: 'realtime-presence-store' },
  ),
);
