import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getCsrfToken } from '@/lib/client/csrf';
import { logger } from '@shared/lib/logger';
import { queryClient, queryKeys } from '@shared/stores/query-client';

export type PermissionLevel = 'allow' | 'ask' | 'deny';

export type ToolPermissionsMap = Record<string, Record<string, PermissionLevel>>;

interface ServerPermission {
  connectorId: string;
  toolName: string;
  level: PermissionLevel;
}

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
    await queryClient.invalidateQueries({ queryKey: queryKeys.connectors.permissions() });
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
    await queryClient.invalidateQueries({ queryKey: queryKeys.connectors.permissions() });
  } catch (err) {
    logger.warn('[ToolPermissions] server reset failed (local cleared):', err);
  }
}

async function fetchPermissionsFromServer(): Promise<ServerPermission[]> {
  const res = await fetch('/api/connectors/permissions', { credentials: 'same-origin' });
  if (!res.ok) {
    throw Object.assign(new Error(`connector permissions fetch failed: HTTP ${res.status}`), {
      status: res.status,
    });
  }
  const data = (await res.json()) as { permissions?: ServerPermission[] };
  return data.permissions ?? [];
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
          const permissions = await queryClient.fetchQuery({
            queryKey: queryKeys.connectors.permissions(),
            queryFn: fetchPermissionsFromServer,
            meta: { silent: true },
            retry: false,
          });
          if (!permissions.length) return;
          set((state) => {
            const merged: ToolPermissionsMap = { ...state.permissions };
            for (const p of permissions) {
              merged[p.connectorId] = { ...merged[p.connectorId], [p.toolName]: p.level };
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
      migrate: (persisted) => persisted,
    },
  ),
);
