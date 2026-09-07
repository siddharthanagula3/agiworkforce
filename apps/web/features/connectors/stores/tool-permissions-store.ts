import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getCsrfToken } from '@/lib/client/csrf';
import { logger } from '@shared/lib/logger';
import { queryClient, queryKeys } from '@shared/stores/query-client';

export type PermissionLevel = 'allow' | 'ask' | 'deny';

export type ToolPermissionsMap = Record<string, Record<string, PermissionLevel>>;

export const DEFAULT_PERMISSION_LEVEL: PermissionLevel = 'ask';

const PERMISSIONS_PATH = '/api/connectors/permissions';
const CSRF_HEADER = 'x-csrf-token';
const JSON_CONTENT_TYPE = 'application/json';
const SAME_ORIGIN: RequestCredentials = 'same-origin';

export const PERMISSION_SAVE_FAILED_COPY =
  'That permission was not saved, so the assistant still follows the level shown here. Try again.';
export const PERMISSION_RESET_FAILED_COPY =
  'These permissions were not reset, so the assistant still follows the levels shown here. Try again.';

interface ServerPermission {
  connectorId: string;
  toolName: string;
  level: PermissionLevel;
}

interface ToolPermissionsState {
  permissions: ToolPermissionsMap;
  saving: Record<string, readonly string[]>;
  saveError: Record<string, string>;
}

interface ToolPermissionsActions {
  setToolPermission: (connectorId: string, toolName: string, level: PermissionLevel) => void;
  getToolPermission: (connectorId: string, toolName: string) => PermissionLevel;
  getConnectorPermissions: (connectorId: string) => Record<string, PermissionLevel>;
  resetConnectorPermissions: (connectorId: string) => void;
  isToolSaving: (connectorId: string, toolName: string) => boolean;
  getSaveError: (connectorId: string) => string | null;
  clearSaveError: (connectorId: string) => void;
  hydrateFromServer: () => Promise<void>;
}

type Store = ToolPermissionsState & ToolPermissionsActions;

class PermissionWriteError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`connector permissions write failed: HTTP ${status}`);
    this.name = 'PermissionWriteError';
    this.status = status;
  }
}

async function writePermissionToServer(
  connectorId: string,
  toolName: string,
  level: PermissionLevel,
): Promise<void> {
  const csrf = await getCsrfToken();
  const response = await fetch(PERMISSIONS_PATH, {
    method: 'PUT',
    credentials: SAME_ORIGIN,
    headers: { 'Content-Type': JSON_CONTENT_TYPE, [CSRF_HEADER]: csrf },
    body: JSON.stringify({ connectorId, toolName, level }),
  });
  if (!response.ok) throw new PermissionWriteError(response.status);
  await queryClient.invalidateQueries({ queryKey: queryKeys.connectors.permissions() });
}

/**
 * Clearing the local map alone was a reset that revoked nothing: the server
 * rows are what the tool loop enforces, and `hydrateFromServer` put every
 * cleared verdict straight back on the next load. A user who reset an
 * `allow` grant kept granting it.
 */
async function clearConnectorPermissionsOnServer(connectorId: string): Promise<void> {
  const csrf = await getCsrfToken();
  const response = await fetch(
    `${PERMISSIONS_PATH}?connectorId=${encodeURIComponent(connectorId)}`,
    {
      method: 'DELETE',
      credentials: SAME_ORIGIN,
      headers: { [CSRF_HEADER]: csrf },
    },
  );
  if (!response.ok) throw new PermissionWriteError(response.status);
  await queryClient.invalidateQueries({ queryKey: queryKeys.connectors.permissions() });
}

async function fetchPermissionsFromServer(): Promise<ServerPermission[]> {
  const res = await fetch(PERMISSIONS_PATH, { credentials: SAME_ORIGIN });
  if (!res.ok) {
    throw Object.assign(new Error(`connector permissions fetch failed: HTTP ${res.status}`), {
      status: res.status,
    });
  }
  const data = (await res.json()) as { permissions?: ServerPermission[] };
  return data.permissions ?? [];
}

function withoutConnector(map: ToolPermissionsMap, connectorId: string): ToolPermissionsMap {
  const next = { ...map };
  delete next[connectorId];
  return next;
}

function withoutKey<T>(map: Record<string, T>, key: string): Record<string, T> {
  if (!(key in map)) return map;
  const next = { ...map };
  delete next[key];
  return next;
}

function markSaving(
  saving: Record<string, readonly string[]>,
  connectorId: string,
  toolName: string,
): Record<string, readonly string[]> {
  const current = saving[connectorId] ?? [];
  if (current.includes(toolName)) return saving;
  return { ...saving, [connectorId]: [...current, toolName] };
}

function unmarkSaving(
  saving: Record<string, readonly string[]>,
  connectorId: string,
  toolName: string,
): Record<string, readonly string[]> {
  const current = saving[connectorId];
  if (!current) return saving;
  const remaining = current.filter((name) => name !== toolName);
  return remaining.length === 0
    ? withoutKey(saving, connectorId)
    : { ...saving, [connectorId]: remaining };
}

export const useToolPermissionsStore = create<Store>()(
  persist(
    (set, get) => ({
      permissions: {},
      saving: {},
      saveError: {},

      setToolPermission: (connectorId, toolName, level) => {
        const previous = get().permissions[connectorId]?.[toolName] ?? null;
        set((state) => ({
          permissions: {
            ...state.permissions,
            [connectorId]: { ...state.permissions[connectorId], [toolName]: level },
          },
          saving: markSaving(state.saving, connectorId, toolName),
          saveError: withoutKey(state.saveError, connectorId),
        }));

        void writePermissionToServer(connectorId, toolName, level)
          .then(() => {
            set((state) => ({ saving: unmarkSaving(state.saving, connectorId, toolName) }));
          })
          .catch((err: unknown) => {
            logger.warn('[ToolPermissions] server write refused, reverting:', err);
            set((state) => {
              const connector = { ...state.permissions[connectorId] };
              if (previous === null) delete connector[toolName];
              else connector[toolName] = previous;
              const permissions =
                Object.keys(connector).length === 0
                  ? withoutConnector(state.permissions, connectorId)
                  : { ...state.permissions, [connectorId]: connector };
              return {
                permissions,
                saving: unmarkSaving(state.saving, connectorId, toolName),
                saveError: { ...state.saveError, [connectorId]: PERMISSION_SAVE_FAILED_COPY },
              };
            });
          });
      },

      getToolPermission: (connectorId, toolName) => {
        return get().permissions[connectorId]?.[toolName] ?? DEFAULT_PERMISSION_LEVEL;
      },

      getConnectorPermissions: (connectorId) => {
        return get().permissions[connectorId] ?? {};
      },

      resetConnectorPermissions: (connectorId) => {
        const previous = get().permissions[connectorId];
        if (!previous) return;
        set((state) => ({
          permissions: withoutConnector(state.permissions, connectorId),
          saveError: withoutKey(state.saveError, connectorId),
        }));

        void clearConnectorPermissionsOnServer(connectorId).catch((err: unknown) => {
          logger.warn('[ToolPermissions] server reset refused, restoring:', err);
          set((state) => ({
            permissions: { ...state.permissions, [connectorId]: previous },
            saveError: { ...state.saveError, [connectorId]: PERMISSION_RESET_FAILED_COPY },
          }));
        });
      },

      isToolSaving: (connectorId, toolName) => {
        return get().saving[connectorId]?.includes(toolName) ?? false;
      },

      getSaveError: (connectorId) => get().saveError[connectorId] ?? null,

      clearSaveError: (connectorId) => {
        set((state) => ({ saveError: withoutKey(state.saveError, connectorId) }));
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
      partialize: (state) => ({ permissions: state.permissions }) as Store,
    },
  ),
);
