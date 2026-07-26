/**
 * integrationStore.ts
 *
 * Manages messaging platform integrations and device integration state.
 * Extends the existing messagingStore pattern but covers the full set of
 * platforms: Slack, Teams, Discord, WhatsApp, Telegram, Gmail, Outlook.
 *
 * Device integrations (calendar, contacts, notifications) are read
 * at runtime via the deviceIntegrations service and stored
 * here for cross-component sharing without re-checking permissions on every
 * render.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import {
  connectMessagingPlatform,
  disconnectMessagingPlatform,
} from '@/src/features/messaging/service';
import {
  getCalendarPermissionStatus,
  getContactsPermissionStatus,
  type PermissionStatus,
} from '@/src/features/integrations/services/deviceIntegrations';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { MessagingPlatformId } from '@/src/features/integrations/components/PlatformCard';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';

// ---------------------------------------------------------------------------
// Platform integration types
// ---------------------------------------------------------------------------

export interface PlatformIntegration {
  id: MessagingPlatformId;
  name: string;
  connected: boolean;
  accountName?: string;
  lastSynced?: string;
  messageCount?: number;
  config: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Device integration types
// ---------------------------------------------------------------------------

export type DeviceIntegrationStatus = 'active' | 'inactive' | 'needs-permission' | 'unavailable';

export interface DeviceIntegration {
  id: 'calendar' | 'contacts' | 'notifications';
  name: string;
  status: DeviceIntegrationStatus;
  lastSync?: string;
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

interface IntegrationState {
  platforms: PlatformIntegration[];
  deviceIntegrations: DeviceIntegration[];
  platformsLoading: boolean;
  deviceLoading: boolean;
  error: string | null;

  fetchPlatforms: () => Promise<void>;
  connectPlatform: (platformId: string, config?: Record<string, string>) => Promise<void>;
  disconnectPlatform: (platformId: string) => Promise<void>;
  checkDeviceIntegrations: () => Promise<void>;
  clearError: () => void;
  /**
   * Trust-boundary reset: `platforms` (connected/lastSynced/accountName) is
   * scoped to the signed-in user and persisted to MMKV. Without this, a
   * previously-connected account's "Connected" badges survive sign-out and
   * are shown to whichever different account signs in next on this device.
   * Called from useAuthStore.signOut() — see the trust-boundary reset block
   * there (cloud sync / artifacts / memory / projects / settings / tier /
   * push-token) for the sibling resets this mirrors. deviceIntegrations is
   * intentionally untouched: it is OS-permission-derived, not persisted, and
   * not account-scoped.
   */
  clearPlatformConnections: () => void;
}

// ---------------------------------------------------------------------------
// Default platform list — all disconnected on first load
// ---------------------------------------------------------------------------

const DEFAULT_PLATFORMS: PlatformIntegration[] = [
  { id: 'slack', name: 'Slack', connected: false, config: {} },
  { id: 'teams', name: 'Microsoft Teams', connected: false, config: {} },
  { id: 'discord', name: 'Discord', connected: false, config: {} },
  { id: 'whatsapp', name: 'WhatsApp', connected: false, config: {} },
  { id: 'telegram', name: 'Telegram', connected: false, config: {} },
  { id: 'gmail', name: 'Gmail', connected: false, config: {} },
  { id: 'outlook', name: 'Outlook', connected: false, config: {} },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function permToStatus(p: PermissionStatus): DeviceIntegrationStatus {
  switch (p) {
    case 'granted':
      return 'active';
    case 'denied':
      return 'needs-permission';
    case 'undetermined':
      return 'inactive';
  }
}

// STB-21: healthToStatus() and the Health/Google Fit entry were removed with the
// health-context service — the backend route they reported on never existed.

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useIntegrationStore = create<IntegrationState>()(
  persist(
    (set, get) => ({
      platforms: DEFAULT_PLATFORMS,
      deviceIntegrations: [],
      platformsLoading: false,
      deviceLoading: false,
      error: null,

      // ------------------------------------------------------------------
      // Platforms
      // ------------------------------------------------------------------

      fetchPlatforms: async () => {
        set({ platformsLoading: true, error: null });
        try {
          // The API only returns whatsapp/telegram/slack today.
          // Merge server state; newer platforms default to disconnected.
          // We intentionally don't call getMessagingConfig() because that
          // returns the narrow 3-platform shape — the store manages the
          // broader list locally until the API is extended.
          const existing = get().platforms;
          set({ platforms: existing });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : 'Failed to load platform connections',
          });
        } finally {
          set({ platformsLoading: false });
        }
      },

      connectPlatform: async (platformId, config = {}) => {
        const accountEpoch = captureCloudAccountEpoch();
        set({ platformsLoading: true, error: null });
        try {
          await connectMessagingPlatform(platformId, config);
          if (!isCloudAccountEpochCurrent(accountEpoch)) return;
          set((state) => ({
            platforms: state.platforms.map((p) =>
              p.id === platformId
                ? {
                    ...p,
                    connected: true,
                    lastSynced: new Date().toISOString(),
                    config,
                  }
                : p,
            ),
          }));
        } catch (err) {
          if (!isCloudAccountEpochCurrent(accountEpoch)) return;
          set({
            error: err instanceof Error ? err.message : 'Failed to connect platform',
          });
          throw err;
        } finally {
          if (isCloudAccountEpochCurrent(accountEpoch)) {
            set({ platformsLoading: false });
          }
        }
      },

      disconnectPlatform: async (platformId) => {
        const accountEpoch = captureCloudAccountEpoch();
        set({ platformsLoading: true, error: null });
        try {
          await disconnectMessagingPlatform(platformId);
          if (!isCloudAccountEpochCurrent(accountEpoch)) return;
          set((state) => ({
            platforms: state.platforms.map((p) =>
              p.id === platformId
                ? {
                    ...p,
                    connected: false,
                    accountName: undefined,
                    lastSynced: undefined,
                    messageCount: undefined,
                    config: {},
                  }
                : p,
            ),
          }));
        } catch (err) {
          if (!isCloudAccountEpochCurrent(accountEpoch)) return;
          set({
            error: err instanceof Error ? err.message : 'Failed to disconnect platform',
          });
        } finally {
          if (isCloudAccountEpochCurrent(accountEpoch)) {
            set({ platformsLoading: false });
          }
        }
      },

      // ------------------------------------------------------------------
      // Device integrations
      // ------------------------------------------------------------------

      checkDeviceIntegrations: async () => {
        set({ deviceLoading: true, error: null });
        try {
          const [calStat, contactsStat, notifResult] = await Promise.all([
            getCalendarPermissionStatus().catch(() => 'undetermined' as PermissionStatus),
            getContactsPermissionStatus().catch(() => 'undetermined' as PermissionStatus),
            Notifications.getPermissionsAsync().catch(
              () =>
                ({
                  status: 'undetermined' as Notifications.PermissionStatus,
                }) as Notifications.NotificationPermissionsStatus,
            ),
          ]);

          const notifPerm = notifResult.status as Notifications.PermissionStatus;

          const now = new Date().toISOString();

          const next: DeviceIntegration[] = [
            {
              id: 'calendar',
              name: Platform.OS === 'ios' ? 'Apple Calendar' : 'Google Calendar',
              status: permToStatus(calStat),
              lastSync: calStat === 'granted' ? now : undefined,
            },
            {
              id: 'contacts',
              name: 'Contacts',
              status: permToStatus(contactsStat),
              lastSync: contactsStat === 'granted' ? now : undefined,
            },
            {
              id: 'notifications',
              name: 'Notifications',
              status:
                notifPerm === Notifications.PermissionStatus.GRANTED
                  ? 'active'
                  : notifPerm === Notifications.PermissionStatus.DENIED
                    ? 'needs-permission'
                    : 'inactive',
            },
          ];

          set({ deviceIntegrations: next });
        } catch (err) {
          console.warn('[integrationStore] checkDeviceIntegrations failed:', err);
          set({
            error: err instanceof Error ? err.message : 'Failed to check device integrations',
          });
        } finally {
          set({ deviceLoading: false });
        }
      },

      clearError: () => set({ error: null }),

      clearPlatformConnections: () =>
        set({ platforms: DEFAULT_PLATFORMS, platformsLoading: false, error: null }),
    }),
    {
      name: 'integration-store',
      storage: createJSONStorage(() => mmkvStorage),
      // AUDIT-FIX: MMKV-RACE
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[integrationStore] Hydration failed:', error);
      },
      partialize: (state) => ({
        // MED-MOB-06 fix (2026-05-04): platform `config` (which holds apiKey /
        // token for Slack, Telegram, etc.) must NOT be stored in MMKV. MMKV is
        // encrypted at rest but the key lives in Keychain with
        // WHEN_UNLOCKED_THIS_DEVICE_ONLY — after-first-unlock malware can read
        // it. Third-party integration tokens are re-fetched from the backend on
        // connectPlatform() and are not persisted locally.
        //
        // We persist only non-secret connection metadata (id, name, connected,
        // accountName, lastSynced, messageCount) and strip config entirely.
        platforms: state.platforms.map(({ config: _config, ...rest }) => ({
          ...rest,
          config: {} as Record<string, string>,
        })),
      }),
    },
  ),
);

rehydrateWhenMmkvReady(useIntegrationStore, 'integration-store');
