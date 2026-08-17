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

const DEFAULT_STATE: StoredPermissionState = {
  lastObservedStatus: 'undetermined',
  userIntent: 'denied',
};

type AllPermissionsMap = Record<MobilePermissionKind, StoredPermissionState>;

function makeDefaults(): AllPermissionsMap {
  return {
    microphone: { ...DEFAULT_STATE },
    camera: { ...DEFAULT_STATE },
    photos: { ...DEFAULT_STATE },
    notifications: { ...DEFAULT_STATE },
    calendar: { ...DEFAULT_STATE },
    reminders: { ...DEFAULT_STATE },
  };
}

export interface PermissionsStoreState {
  permissions: AllPermissionsMap;

  setObservedStatus: (kind: MobilePermissionKind, status: OsPermissionStatus) => void;

  setUserIntent: (kind: MobilePermissionKind, level: MobilePermissionLevel) => void;

  getPermission: (kind: MobilePermissionKind) => StoredPermissionState;
}

export const usePermissionsStore = create<PermissionsStoreState>()(
  persist(
    (set, get) => ({
      permissions: makeDefaults(),

      setObservedStatus: (kind, status) => {
        set((state) => {
          const prev = state.permissions[kind];
          const wasUndetermined = prev?.lastObservedStatus === 'undetermined';
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
