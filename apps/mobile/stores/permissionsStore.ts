/**
 * Permissions Store
 *
 * Persists last-observed OS permission status and user-intent level for each
 * of the 6 top-priority mobile permissions. Backed by encrypted MMKV (v1
 * LOCAL ONLY — no cloud sync).
 *
 * Permission state MUST NOT be written to cloud storage. If a cloud path is
 * ever needed in future, route through assertSurfaceCanSyncChats('mobile').
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import type {
  MobilePermissionKind,
  StoredPermissionState,
  OsPermissionStatus,
  MobilePermissionLevel,
} from '@/src/features/settings/permissions/types';
import { osStatusToLevel } from '@/src/features/settings/permissions/registry';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_STATE: StoredPermissionState = {
  lastObservedStatus: 'undetermined',
  userIntent: 'denied',
};

type AllPermissionsMap = Record<MobilePermissionKind, StoredPermissionState>;

function makeDefaults(): AllPermissionsMap {
  return {
    microphone: { ...DEFAULT_STATE },
    camera: { ...DEFAULT_STATE },
    location: { ...DEFAULT_STATE },
    photos: { ...DEFAULT_STATE },
    notifications: { ...DEFAULT_STATE },
    contacts: { ...DEFAULT_STATE },
  };
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface PermissionsStoreState {
  permissions: AllPermissionsMap;

  /**
   * Update the last-observed OS status for a permission (called on mount /
   * focus return, never on user action directly).
   */
  setObservedStatus: (kind: MobilePermissionKind, status: OsPermissionStatus) => void;

  /**
   * Record the user's explicit intent level. Called when the user interacts
   * with the toggle or the level picker — not when we silently read OS state.
   */
  setUserIntent: (kind: MobilePermissionKind, level: MobilePermissionLevel) => void;

  /** Convenience: read one permission's stored state. */
  getPermission: (kind: MobilePermissionKind) => StoredPermissionState;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export const usePermissionsStore = create<PermissionsStoreState>()(
  persist(
    (set, get) => ({
      permissions: makeDefaults(),

      setObservedStatus: (kind, status) => {
        set((state) => {
          const prev = state.permissions[kind];
          const wasUndetermined = prev?.lastObservedStatus === 'undetermined';
          // Sync userIntent to the OS truth when (a) this is the first observe, or
          // (b) the OS no longer reports a grant — i.e. the permission was revoked
          // externally (Settings). Without (b) the radio kept highlighting a
          // granted level while the card showed "Access Denied".
          const userIntent =
            wasUndetermined || status !== 'granted'
              ? osStatusToLevel(status, kind)
              : (prev?.userIntent ?? osStatusToLevel(status, kind));
          return {
            permissions: {
              ...state.permissions,
              [kind]: {
                ...prev,
                lastObservedStatus: status,
                userIntent,
              },
            },
          };
        });
      },

      setUserIntent: (kind, level) => {
        set((state) => ({
          permissions: {
            ...state.permissions,
            [kind]: {
              ...state.permissions[kind],
              userIntent: level,
            },
          },
        }));
      },

      getPermission: (kind) => {
        return get().permissions[kind] ?? { ...DEFAULT_STATE };
      },
    }),
    {
      name: 'permissions-store',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[permissionsStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(usePermissionsStore, 'permissionsStore');
