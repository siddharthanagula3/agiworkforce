import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import type {
  MobilePermissionKind,
  StoredPermissionState,
  OsPermissionStatus,
} from '@/src/features/settings/permissions/types';

const DEFAULT_STATE: StoredPermissionState = {
  lastObservedStatus: 'undetermined',
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

function isOsPermissionStatus(value: unknown): value is OsPermissionStatus {
  return value === 'granted' || value === 'denied' || value === 'undetermined';
}

export interface PermissionsStoreState {
  permissions: AllPermissionsMap;

  setObservedStatus: (kind: MobilePermissionKind, status: OsPermissionStatus) => void;

  getPermission: (kind: MobilePermissionKind) => StoredPermissionState;
}

export const usePermissionsStore = create<PermissionsStoreState>()(
  persist(
    (set, get) => ({
      permissions: makeDefaults(),

      setObservedStatus: (kind, status) => {
        set((state) => ({
          permissions: {
            ...state.permissions,
            [kind]: { lastObservedStatus: status },
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
      version: 1,
      migrate: (persisted) => {
        const stored = (persisted as { permissions?: Record<string, unknown> } | null)?.permissions;
        const permissions = makeDefaults();
        for (const kind of Object.keys(permissions) as MobilePermissionKind[]) {
          const observed = (stored?.[kind] as StoredPermissionState | undefined)
            ?.lastObservedStatus;
          if (isOsPermissionStatus(observed)) permissions[kind] = { lastObservedStatus: observed };
        }
        return { permissions };
      },
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[permissionsStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(usePermissionsStore, 'permissionsStore');
