import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';
import {
  getMessagingConfig,
  connectMessagingPlatform,
  disconnectMessagingPlatform,
} from '@/services/messaging';

export interface MessagingPlatform {
  id: 'whatsapp' | 'telegram' | 'slack';
  name: string;
  connected: boolean;
  connectedAt: string | null;
  config: Record<string, string>;
  stats: {
    messagesSent: number;
    messagesReceived: number;
    lastActive: string | null;
  };
}

interface MessagingState {
  platforms: MessagingPlatform[];
  loading: boolean;
  error: string | null;
  fetchPlatforms: () => Promise<void>;
  connectPlatform: (id: string, config: Record<string, string>) => Promise<void>;
  disconnectPlatform: (id: string) => Promise<void>;
  updateStats: (id: string, stats: Partial<MessagingPlatform['stats']>) => void;
  clearError: () => void;
}

const DEFAULT_PLATFORMS: MessagingPlatform[] = [
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    connected: false,
    connectedAt: null,
    config: {},
    stats: { messagesSent: 0, messagesReceived: 0, lastActive: null },
  },
  {
    id: 'telegram',
    name: 'Telegram',
    connected: false,
    connectedAt: null,
    config: {},
    stats: { messagesSent: 0, messagesReceived: 0, lastActive: null },
  },
  {
    id: 'slack',
    name: 'Slack',
    connected: false,
    connectedAt: null,
    config: {},
    stats: { messagesSent: 0, messagesReceived: 0, lastActive: null },
  },
];

export const useMessagingStore = create<MessagingState>()(
  persist(
    (set, get) => ({
      platforms: DEFAULT_PLATFORMS,
      loading: false,
      error: null,

      fetchPlatforms: async () => {
        set({ loading: true, error: null });
        try {
          const data = await getMessagingConfig();
          const connections = data.connections ?? [];

          // Merge server data with local platforms — preserve local state when server has no data
          const updatedPlatforms = get().platforms.map((platform) => {
            const serverConn = connections.find((c) => c.platform === platform.id);
            if (serverConn) {
              return {
                ...platform,
                connected: serverConn.is_active,
                connectedAt: serverConn.connected_at,
                config: serverConn.config as Record<string, string>,
              };
            }
            // No server data — keep local state as-is instead of wiping
            return platform;
          });

          set({ platforms: updatedPlatforms });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to load messaging connections',
          });
        } finally {
          set({ loading: false });
        }
      },

      connectPlatform: async (id, config) => {
        set({ loading: true, error: null });
        try {
          await connectMessagingPlatform(id, config);

          set((state) => ({
            platforms: state.platforms.map((p) =>
              p.id === id
                ? {
                    ...p,
                    connected: true,
                    connectedAt: new Date().toISOString(),
                    config,
                  }
                : p,
            ),
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to connect platform',
          });
          throw error;
        } finally {
          set({ loading: false });
        }
      },

      disconnectPlatform: async (id) => {
        set({ loading: true, error: null });
        try {
          await disconnectMessagingPlatform(id);

          set((state) => ({
            platforms: state.platforms.map((p) =>
              p.id === id
                ? {
                    ...p,
                    connected: false,
                    connectedAt: null,
                    config: {},
                    stats: { messagesSent: 0, messagesReceived: 0, lastActive: null },
                  }
                : p,
            ),
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to disconnect platform',
          });
        } finally {
          set({ loading: false });
        }
      },

      updateStats: (id, stats) => {
        set((state) => ({
          platforms: state.platforms.map((p) =>
            p.id === id ? { ...p, stats: { ...p.stats, ...stats } } : p,
          ),
        }));
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'messaging-store',
      storage: createJSONStorage(() => mmkvStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[messagingStore] Hydration failed:', error);
      },
      partialize: (state) => ({
        // Persist platform connection state for offline access
        // Do NOT persist loading or error state
        platforms: state.platforms,
      }),
    },
  ),
);
