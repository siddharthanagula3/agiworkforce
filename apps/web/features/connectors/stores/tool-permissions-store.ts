import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  CONNECTOR_TOOL_PERMISSIONS_MAX_TOOLS_PER_WRITE,
  CONNECTOR_TOOL_PERMISSIONS_PATH,
  ListConnectorToolPermissionsResponseSchema,
  connectorCategoryToolName,
  type ConnectorToolCategory,
  type ConnectorToolPermission,
  type ConnectorToolPermissionLevel,
  type UpsertConnectorToolPermissionRequest,
} from '@agiworkforce/cloud-contracts';
import { getCsrfToken } from '@/lib/client/csrf';
import { logger } from '@shared/lib/logger';
import { queryClient, queryKeys } from '@shared/stores/query-client';

export type PermissionLevel = ConnectorToolPermissionLevel;

export type ToolPermissionsMap = Record<string, Record<string, PermissionLevel>>;

export const DEFAULT_PERMISSION_LEVEL: PermissionLevel = 'ask';

const CSRF_HEADER = 'x-csrf-token';
const JSON_CONTENT_TYPE = 'application/json';
const SAME_ORIGIN: RequestCredentials = 'same-origin';

export const PERMISSION_SAVE_FAILED_COPY =
  'That permission was not saved, so the assistant still follows the level shown here. Try again.';
export const PERMISSION_RESET_FAILED_COPY =
  'These permissions were not reset, so the assistant still follows the levels shown here. Try again.';

interface ToolPermissionsState {
  permissions: ToolPermissionsMap;
  saving: Record<string, readonly string[]>;
  saveError: Record<string, string>;
}

interface ToolPermissionsActions {
  setToolPermission: (connectorId: string, toolName: string, level: PermissionLevel) => void;
  setToolsPermission: (
    connectorId: string,
    toolNames: readonly string[],
    level: PermissionLevel,
    category?: ConnectorToolCategory,
  ) => void;
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
  toolNames: readonly string[],
  level: PermissionLevel,
  category?: ConnectorToolCategory,
): Promise<void> {
  const csrf = await getCsrfToken();
  const put = async (body: UpsertConnectorToolPermissionRequest) => {
    const response = await fetch(CONNECTOR_TOOL_PERMISSIONS_PATH, {
      method: 'PUT',
      credentials: SAME_ORIGIN,
      headers: { 'Content-Type': JSON_CONTENT_TYPE, [CSRF_HEADER]: csrf },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new PermissionWriteError(response.status);
  };
  if (category) await put({ connectorId, level, category });
  for (
    let start = 0;
    start < toolNames.length;
    start += CONNECTOR_TOOL_PERMISSIONS_MAX_TOOLS_PER_WRITE
  ) {
    const chunk = toolNames.slice(start, start + CONNECTOR_TOOL_PERMISSIONS_MAX_TOOLS_PER_WRITE);
    await put(
      chunk.length === 1
        ? { connectorId, level, toolName: chunk[0] }
        : { connectorId, level, toolNames: chunk },
    );
  }
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
    `${CONNECTOR_TOOL_PERMISSIONS_PATH}?connectorId=${encodeURIComponent(connectorId)}`,
    {
      method: 'DELETE',
      credentials: SAME_ORIGIN,
      headers: { [CSRF_HEADER]: csrf },
    },
  );
  if (!response.ok) throw new PermissionWriteError(response.status);
  await queryClient.invalidateQueries({ queryKey: queryKeys.connectors.permissions() });
}

async function fetchPermissionsFromServer(): Promise<ConnectorToolPermission[]> {
  const res = await fetch(CONNECTOR_TOOL_PERMISSIONS_PATH, { credentials: SAME_ORIGIN });
  if (!res.ok) {
    throw Object.assign(new Error(`connector permissions fetch failed: HTTP ${res.status}`), {
      status: res.status,
    });
  }
  const parsed = ListConnectorToolPermissionsResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error('connector permissions response was not readable');
  return parsed.data.permissions;
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
        get().setToolsPermission(connectorId, [toolName], level);
      },

      setToolsPermission: (connectorId, listedToolNames, level, category) => {
        const toolNames = category
          ? [...listedToolNames, connectorCategoryToolName(category)]
          : listedToolNames;
        if (toolNames.length === 0) return;
        const previous = get().permissions[connectorId] ?? {};
        set((state) => ({
          permissions: {
            ...state.permissions,
            [connectorId]: {
              ...state.permissions[connectorId],
              ...Object.fromEntries(toolNames.map((name) => [name, level])),
            },
          },
          saving: toolNames.reduce(
            (saving, name) => markSaving(saving, connectorId, name),
            state.saving,
          ),
          saveError: withoutKey(state.saveError, connectorId),
        }));

        const unmarkAll = (saving: Record<string, readonly string[]>) =>
          toolNames.reduce((next, name) => unmarkSaving(next, connectorId, name), saving);

        void writePermissionToServer(connectorId, listedToolNames, level, category)
          .then(() => {
            set((state) => ({ saving: unmarkAll(state.saving) }));
          })
          .catch((err: unknown) => {
            logger.warn('[ToolPermissions] server write refused, reverting:', err);
            set((state) => {
              const connector = { ...state.permissions[connectorId] };
              for (const name of toolNames) {
                const prior = previous[name];
                if (prior === undefined) delete connector[name];
                else connector[name] = prior;
              }
              const permissions =
                Object.keys(connector).length === 0
                  ? withoutConnector(state.permissions, connectorId)
                  : { ...state.permissions, [connectorId]: connector };
              return {
                permissions,
                saving: unmarkAll(state.saving),
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
