import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getCsrfToken } from '@/lib/client/csrf';
import { logger } from '@shared/lib/logger';

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
  /**
   * Load the user's server-persisted verdicts (cross-device) and merge them in.
   * Local wins on conflict so an in-flight hydrate never clobbers a just-set
   * value. Best-effort — a failure leaves the localStorage copy intact.
   */
  hydrateFromServer: () => Promise<void>;
}

// Fire-and-forget server persistence so a "block this tool" verdict follows the
// user across devices and gains server durability. The generic per-invocation
// approval gate is enforced server-side in the tool loop regardless; this only
// persists the remembered policy. Offline/failure is non-fatal — localStorage
// holds the local copy.
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
              // Local wins on conflict (a just-set value must not be clobbered
              // by an in-flight hydrate); the server only fills gaps.
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
