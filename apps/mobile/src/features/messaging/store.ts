import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import {
  getMessagingConfig,
  connectMessagingPlatform,
  disconnectMessagingPlatform,
} from '@/src/features/messaging/service';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';

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
  /** Clear every Clerk-account connection cache on sign-out/account switch. */
  clearAccountMessaging: () => void;
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

function stripPlatformSecrets(platform: MessagingPlatform): MessagingPlatform {
  return {
    ...platform,
    config: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isActiveConnection(value: unknown): value is {
  is_active: boolean;
  connected_at?: unknown;
} {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).is_active === 'boolean'
  );
}

function normalizeConnectedAt(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return new Date().toISOString();
}

function normalizePersistedConnectedAt(value: unknown, fallback: string | null): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (value === null) return null;
  return fallback;
}

function normalizePersistedCount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizePersistedStats(
  value: unknown,
  fallback: MessagingPlatform['stats'],
): MessagingPlatform['stats'] {
  if (!isRecord(value)) return fallback;
  return {
    messagesSent: normalizePersistedCount(value.messagesSent, fallback.messagesSent),
    messagesReceived: normalizePersistedCount(value.messagesReceived, fallback.messagesReceived),
    lastActive:
      typeof value.lastActive === 'string' || value.lastActive === null
        ? value.lastActive
        : fallback.lastActive,
  };
}

function mergePersistedPlatforms(
  currentPlatforms: MessagingPlatform[],
  persistedPlatforms: unknown,
): MessagingPlatform[] {
  if (!Array.isArray(persistedPlatforms)) return currentPlatforms;

  return currentPlatforms.map((platform) => {
    const persisted = persistedPlatforms.find(
      (candidate) => isRecord(candidate) && candidate.id === platform.id,
    );
    if (!isRecord(persisted)) return platform;

    return stripPlatformSecrets({
      ...platform,
      connected:
        typeof persisted.connected === 'boolean' ? persisted.connected : platform.connected,
      connectedAt: normalizePersistedConnectedAt(persisted.connectedAt, platform.connectedAt),
      stats: normalizePersistedStats(persisted.stats, platform.stats),
    });
  });
}

export const useMessagingStore = create<MessagingState>()(
  persist(
    (set, get) => ({
      platforms: DEFAULT_PLATFORMS,
      loading: false,
      error: null,

      fetchPlatforms: async () => {
        const account = captureCloudAccountEpoch();
        if (!account) return;
        set({ loading: true, error: null });
        try {
          const data = await getMessagingConfig();
          if (!isCloudAccountEpochCurrent(account)) return;
          const connections = data.connections ?? [];

          // Merge server data with local platforms — preserve local state when server has no data
          const updatedPlatforms = get().platforms.map((platform) => {
            const serverConn = connections.find((c) => c.platform === platform.id);
            if (serverConn) {
              return {
                ...platform,
                connected: serverConn.is_active,
                connectedAt: serverConn.connected_at,
                config: {},
              };
            }
            // No server data — keep local state as-is instead of wiping
            return platform;
          });

          set({ platforms: updatedPlatforms });
        } catch (error) {
          if (!isCloudAccountEpochCurrent(account)) return;
          set({
            error: error instanceof Error ? error.message : 'Failed to load messaging connections',
          });
        } finally {
          if (isCloudAccountEpochCurrent(account)) set({ loading: false });
        }
      },

      connectPlatform: async (id, config) => {
        const account = captureCloudAccountEpoch();
        if (!account) return;
        set({ loading: true, error: null });
        try {
          const result = await connectMessagingPlatform(id, config);
          if (!isCloudAccountEpochCurrent(account)) return;
          if (!isActiveConnection(result.connection) || !result.connection.is_active) {
            throw new Error('Messaging provider did not confirm an active connection');
          }
          const connectedAt = normalizeConnectedAt(result.connection.connected_at);

          set((state) => ({
            platforms: state.platforms.map((p) =>
              p.id === id
                ? {
                    ...p,
                    connected: true,
                    connectedAt,
                    config: {},
                  }
                : p,
            ),
          }));
        } catch (error) {
          if (!isCloudAccountEpochCurrent(account)) return;
          set({
            error: error instanceof Error ? error.message : 'Failed to connect platform',
          });
          throw error;
        } finally {
          if (isCloudAccountEpochCurrent(account)) set({ loading: false });
        }
      },

      disconnectPlatform: async (id) => {
        const account = captureCloudAccountEpoch();
        if (!account) return;
        set({ loading: true, error: null });
        try {
          await disconnectMessagingPlatform(id);
          if (!isCloudAccountEpochCurrent(account)) return;

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
          if (!isCloudAccountEpochCurrent(account)) return;
          set({
            error: error instanceof Error ? error.message : 'Failed to disconnect platform',
          });
        } finally {
          if (isCloudAccountEpochCurrent(account)) set({ loading: false });
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

      clearAccountMessaging: () => {
        set({
          platforms: DEFAULT_PLATFORMS.map((platform) => ({
            ...platform,
            config: {},
            stats: { ...platform.stats },
          })),
          loading: false,
          error: null,
        });
      },
    }),
    {
      name: 'messaging-store',
      storage: createJSONStorage(() => mmkvStorage),
      // AUDIT-FIX: MMKV-RACE
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[messagingStore] Hydration failed:', error);
      },
      partialize: (state) => ({
        // Persist platform connection state for offline access
        // Do NOT persist loading or error state
        platforms: state.platforms.map(stripPlatformSecrets),
      }),
      merge: (persistedState, currentState) => {
        const persisted = isRecord(persistedState) ? persistedState : {};
        return {
          ...currentState,
          platforms: mergePersistedPlatforms(currentState.platforms, persisted.platforms),
          loading: false,
          error: null,
        };
      },
    },
  ),
);

rehydrateWhenMmkvReady(useMessagingStore, 'messaging-store');
