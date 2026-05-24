import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PermissionLevel = 'allow' | 'ask' | 'deny';

/**
 * Nested map: connectorId -> toolName -> PermissionLevel
 * All tools default to 'ask' (needs approval) when not explicitly set.
 */
export type ToolPermissionsMap = Record<string, Record<string, PermissionLevel>>;

interface ToolPermissionsState {
  permissions: ToolPermissionsMap;
}

interface ToolPermissionsActions {
  setToolPermission: (connectorId: string, toolName: string, level: PermissionLevel) => void;
  getToolPermission: (connectorId: string, toolName: string) => PermissionLevel;
  getConnectorPermissions: (connectorId: string) => Record<string, PermissionLevel>;
  resetConnectorPermissions: (connectorId: string) => void;
}

export const useToolPermissionsStore = create<ToolPermissionsState & ToolPermissionsActions>()(
  persist(
    (set, get) => ({
      permissions: {},

      setToolPermission: (connectorId, toolName, level) => {
        set((state) => ({
          permissions: {
            ...state.permissions,
            [connectorId]: {
              ...state.permissions[connectorId],
              [toolName]: level,
            },
          },
        }));
      },

      getToolPermission: (connectorId, toolName) => {
        return get().permissions[connectorId]?.[toolName] ?? 'ask';
      },

      getConnectorPermissions: (connectorId) => {
        return get().permissions[connectorId] ?? {};
      },

      resetConnectorPermissions: (connectorId) => {
        set((state) => {
          const next = { ...state.permissions };
          delete next[connectorId];
          return { permissions: next };
        });
      },
    }),
    {
      name: 'agi-tool-permissions',
      version: 1,
    },
  ),
);
