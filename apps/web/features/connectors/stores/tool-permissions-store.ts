import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getCsrfToken } from '@/lib/client/csrf';
import { logger } from '@shared/lib/logger';

export type PermissionLevel = 'allow' | 'ask' | 'deny';

export type ToolPermissionsMap = Record<string, Record<string, PermissionLevel>>;

interface ToolPermissionsState {
  permissions: ToolPermissionsMap;
}

interface ToolPermissionsActions {
  setToolPermission: (connectorId: string, toolName: string, level: PermissionLevel) => void;
  getToolPermission: (connectorId: string, toolName: string) => PermissionLevel;
  getConnectorPermissions: (connectorId: string) => Record<string, PermissionLevel>;
  resetConnectorPermissions: (connectorId: string) => void;
  hydrateFromServer: () => Promise<void>;
}

async function persistPermissionToServer(
  connectorId: string,
  toolName: string,
  level: PermissionLevel,
): Promise<void> {
  try {
    const csrf = await getCsrfToken();
    await fetch('/api/connectors/permissions', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify({ connectorId, toolName, level }),
    });
  } catch (err) {
    logger.warn('[ToolPermissions] server persist failed (kept locally):', err);
  }
}

/**
 * Clearing the local map alone was a reset that revoked nothing: the server
 * rows are what the tool loop enforces, and `hydrateFromServer` put every
 * cleared verdict straight back on the next load. A user who reset an
 * `allow` grant kept granting it.
 */
async function clearConnectorPermissionsOnServer(connectorId: string): Promise<void> {
  try {
    const csrf = await getCsrfToken();
    await fetch(`/api/connectors/permissions?connectorId=${encodeURIComponent(connectorId)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'x-csrf-token': csrf },
    });
  } catch (err) {
    logger.warn('[ToolPermissions] server reset failed (local cleared):', err);
  }
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
        void persistPermissionToServer(connectorId, toolName, level);
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
        void clearConnectorPermissionsOnServer(connectorId);
      },

      hydrateFromServer: async () => {
        try {
          const res = await fetch('/api/connectors/permissions', { credentials: 'same-origin' });
          if (!res.ok) return;
          const data = (await res.json()) as {
            permissions?: Array<{ connectorId: string; toolName: string; level: PermissionLevel }>;
          };
          if (!data.permissions?.length) return;
          set((state) => {
            const merged: ToolPermissionsMap = { ...state.permissions };
            for (const p of data.permissions ?? []) {
              merged[p.connectorId] = { [p.toolName]: p.level, ...merged[p.connectorId] };
            }
            return { permissions: merged };
          });
        } catch (err) {
          logger.warn('[ToolPermissions] server hydrate failed (using local):', err);
        }
      },
    }),
    {
      name: 'agi-tool-permissions',
      version: 1,
    },
  ),
);
