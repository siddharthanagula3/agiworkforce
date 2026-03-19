/**
 * integrationStore.ts
 *
 * Manages messaging platform integrations and device integration state.
 * Extends the existing messagingStore pattern but covers the full set of
 * platforms: Slack, Teams, Discord, WhatsApp, Telegram, Gmail, Outlook.
 *
 * Device integrations (health, calendar, location, notifications) are read
 * at runtime via the deviceIntegrations / healthData services and stored
 * here for cross-component sharing without re-checking permissions on every
 * render.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';
import { connectMessagingPlatform, disconnectMessagingPlatform } from '@/services/messaging';
import {
  getCalendarPermissionStatus,
  getContactsPermissionStatus,
  type PermissionStatus,
} from '@/services/deviceIntegrations';
import {
  isHealthAvailable,
  getHealthPermissionStatus,
  type HealthPermissionStatus,
} from '@/services/healthData';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { MessagingPlatformId } from '@/components/integrations/PlatformCard';

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
  id: 'health' | 'calendar' | 'contacts' | 'notifications';
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

function healthToStatus(h: HealthPermissionStatus): DeviceIntegrationStatus {
  switch (h) {
    case 'granted':
      return 'active';
    case 'denied':
      return 'needs-permission';
    case 'unavailable':
      return 'unavailable';
    case 'undetermined':
      return 'inactive';
  }
}

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
        set({ platformsLoading: true, error: null });
        try {
          await connectMessagingPlatform(platformId, config);
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
          set({
            error: err instanceof Error ? err.message : 'Failed to connect platform',
          });
          throw err;
        } finally {
          set({ platformsLoading: false });
        }
      },

      disconnectPlatform: async (platformId) => {
        set({ platformsLoading: true, error: null });
        try {
          await disconnectMessagingPlatform(platformId);
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
          set({
            error: err instanceof Error ? err.message : 'Failed to disconnect platform',
          });
        } finally {
          set({ platformsLoading: false });
        }
      },

      // ------------------------------------------------------------------
      // Device integrations
      // ------------------------------------------------------------------

      checkDeviceIntegrations: async () => {
        set({ deviceLoading: true });
        try {
          const [calStat, contactsStat, notifResult] = await Promise.all([
            getCalendarPermissionStatus(),
            getContactsPermissionStatus(),
            Notifications.getPermissionsAsync(),
          ]);

          const notifPerm = notifResult.status as Notifications.PermissionStatus;

          const healthStat = isHealthAvailable()
            ? await getHealthPermissionStatus()
            : 'unavailable';

          const now = new Date().toISOString();

          const next: DeviceIntegration[] = [
            {
              id: 'health',
              name: Platform.OS === 'ios' ? 'Apple Health' : 'Google Fit',
              status: healthToStatus(healthStat as HealthPermissionStatus),
              lastSync: healthStat === 'granted' ? now : undefined,
            },
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
        } finally {
          set({ deviceLoading: false });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'integration-store',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        // Persist platform connection state only — don't persist loading/error/device status
        platforms: state.platforms,
      }),
    },
  ),
);
