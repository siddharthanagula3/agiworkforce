/**
 * Device Link Store
 *
 * Manages the OAuth/device-pairing tokens used for the mobile companion app
 * and any desktop-to-cloud device link flow.
 *
 * State:
 *   - accessToken / refreshToken — short-lived OAuth tokens from the device
 *     link flow. These are NOT the Supabase session tokens (those live in
 *     supabaseAuth service).
 *   - deviceLinkId / deviceLinkCode — identifiers for a pending device pair.
 *
 * Extracted from the unified auth.ts god store.
 *
 * Persist key: 'device-link-storage' (v1)
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { storageFallback } from '../lib/storageFallback';

// =============================================================================
// State & Actions
// =============================================================================

interface DeviceLinkState {
  /** Short-lived OAuth access token from device link flow. */
  accessToken: string | null;
  /** Refresh token for renewing the access token. */
  refreshToken: string | null;
  /** Unique device link identifier returned by device_link_initiate. */
  deviceLinkId: string | null;
  /** Short user-visible code shown during device pairing. */
  deviceLinkCode: string | null;
}

interface DeviceLinkActions {
  /**
   * Store the access + refresh tokens after a successful device link /
   * OAuth flow.
   */
  login: (tokens: { accessToken: string; refreshToken: string }) => void;
  /**
   * Save the device link identifiers returned by the backend during the
   * initiation phase of the pairing handshake.
   */
  setDeviceLink: (id: string, code: string) => void;
  /** Clear all device link state (called on logout). */
  reset: () => void;
}

export type DeviceLinkStore = DeviceLinkState & DeviceLinkActions;

// =============================================================================
// Default state
// =============================================================================

const DEFAULT_STATE: DeviceLinkState = {
  accessToken: null,
  refreshToken: null,
  deviceLinkId: null,
  deviceLinkCode: null,
};

// =============================================================================
// Store
// =============================================================================

export const useDeviceLinkStore = create<DeviceLinkStore>()(
  devtools(
    persist(
      subscribeWithSelector((set) => ({
        ...DEFAULT_STATE,

        login: (tokens) => {
          set(
            {
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
            },
            undefined,
            'deviceLink/login',
          );
        },

        setDeviceLink: (id, code) => {
          set({ deviceLinkId: id, deviceLinkCode: code }, undefined, 'deviceLink/setDeviceLink');
        },

        reset: () => {
          set(DEFAULT_STATE, undefined, 'deviceLink/reset');
        },
      })),
      {
        name: 'device-link-storage',
        version: 1,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        // Persist tokens so the app can refresh them across restarts
        partialize: (state) => ({
          accessToken: state.accessToken,
          refreshToken: state.refreshToken,
          deviceLinkId: state.deviceLinkId,
          deviceLinkCode: state.deviceLinkCode,
        }),
        onRehydrateStorage: () => () => {
          // Tokens are validated lazily when first used
        },
      },
    ),
    { name: 'DeviceLinkStore', enabled: import.meta.env.DEV },
  ),
);

// =============================================================================
// Selectors
// =============================================================================

export const selectDeviceAccessToken = (s: DeviceLinkStore) => s.accessToken;
export const selectDeviceRefreshToken = (s: DeviceLinkStore) => s.refreshToken;
export const selectDeviceLinkId = (s: DeviceLinkStore) => s.deviceLinkId;
export const selectDeviceLinkCode = (s: DeviceLinkStore) => s.deviceLinkCode;
export const selectIsDeviceLinked = (s: DeviceLinkStore) => s.accessToken !== null;
