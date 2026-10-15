/**
 * Connector permission store.
 *
 *   - Tauri (Desktop): encrypted under the device key at
 *     `~/.agiworkforce/connector-permissions.json`, reached through the
 *     `connector_permission_*` Tauri commands. This is also what the Rust tool
 *     executor reads when it enforces a permission, so the UI and the
 *     enforcement point share one source of truth. A store that exists and
 *     cannot be opened blocks every connector tool there, so `list` reports
 *     that state instead of an empty list, and `reset` starts it again.
 *   - Any other runtime: unsupported, and says so (CON-26). The previous
 *     "Cloud mode" branch accepted writes and discarded them; see the note above
 *     {@link ConnectorPermissionsUnavailableError}.
 *
 * Usage:
 *   import { getConnectorPermissionStore } from './connectorPermissionStore';
 *   const store = getConnectorPermissionStore();
 *   await store.set('github', 'create_issue', 'needs-approval');
 *   const level = await store.get('github', 'create_issue'); // 'needs-approval' | null
 */

import type {
  ConnectorPermissionLevel,
  ConnectorToolPermission,
  ConnectorPermissionStorage,
} from '@agiworkforce/types';
import { defaultPermissionForTool } from '@agiworkforce/types';

const isTauriEnv: boolean =
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

export type ConnectorPermissionStoreState =
  | { state: 'ok' }
  | { state: 'missing' }
  | { state: 'unreadable'; reason: string; unlockMayFix: boolean };

export interface ConnectorPermissionListing {
  store: ConnectorPermissionStoreState;
  permissions: ConnectorToolPermission[];
}

export interface ConnectorPermissionReset {
  reset: boolean;
  /** The file name the unreadable store was kept under, beside the new one. */
  keptAs: string | null;
}

export interface ConnectorPermissionStore {
  storage: ConnectorPermissionStorage;

  get(connectorId: string, toolName: string): Promise<ConnectorPermissionLevel | null>;

  /**
   * Save a permission level for a specific connector/tool pair.
   * @param destructive - whether the tool is flagged as destructive; only
   *   used to populate the stored record so the Rust side can surface the
   *   right default if the record is deleted.
   */
  set(
    connectorId: string,
    toolName: string,
    level: ConnectorPermissionLevel,
    destructive?: boolean,
  ): Promise<void>;

  /** The saved permissions for a connector, and whether the store they live in opens. */
  list(connectorId: string): Promise<ConnectorPermissionListing>;

  /**
   * Replace a store that cannot be opened with an empty one. The old file is
   * kept under a new name. Does nothing when the store opens.
   */
  reset(): Promise<ConnectorPermissionReset>;
}

export function getConnectorPermissionStore(): ConnectorPermissionStore {
  if (isTauriEnv) {
    return new LocalVaultStore();
  }
  return new UnsupportedRuntimeStore();
}

class LocalVaultStore implements ConnectorPermissionStore {
  readonly storage: ConnectorPermissionStorage = 'local-vault';

  async get(connectorId: string, toolName: string): Promise<ConnectorPermissionLevel | null> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const level = await invoke<string | null>('connector_permission_get', {
        connectorId,
        toolName,
      });
      return (level as ConnectorPermissionLevel | null) ?? null;
    } catch (err) {
      console.warn('[ConnectorPermissions] get failed:', err);
      return null;
    }
  }

  async set(
    connectorId: string,
    toolName: string,
    level: ConnectorPermissionLevel,
    destructive = false,
  ): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke<void>('connector_permission_set', {
      connectorId,
      toolName,
      level,
      destructive,
    });
  }

  async list(connectorId: string): Promise<ConnectorPermissionListing> {
    const { invoke } = await import('@tauri-apps/api/core');
    const raw = await invoke<{
      store: ConnectorPermissionStoreState;
      permissions: Array<{ toolName: string; level: string; destructive: boolean }>;
    }>('connector_permission_list', { connectorId });
    return {
      store: raw.store,
      permissions: raw.permissions.map((r) => ({
        toolName: r.toolName,
        level: r.level as ConnectorPermissionLevel,
        destructive: r.destructive,
      })),
    };
  }

  async reset(): Promise<ConnectorPermissionReset> {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<ConnectorPermissionReset>('connector_permission_reset');
  }
}

export class ConnectorPermissionsUnavailableError extends Error {
  readonly code = 'CONNECTOR_PERMISSIONS_UNAVAILABLE';

  constructor(operation: string) {
    super(
      `Connector tool permissions are unavailable in this runtime (${operation}). ` +
        `They are stored in the encrypted desktop vault via Tauri; no cloud-backed ` +
        `permission store exists yet, so this request cannot be honoured.`,
    );
    this.name = 'ConnectorPermissionsUnavailableError';
  }
}

class UnsupportedRuntimeStore implements ConnectorPermissionStore {
  readonly storage: ConnectorPermissionStorage = 'unsupported';

  async get(_connectorId: string, _toolName: string): Promise<ConnectorPermissionLevel | null> {
    throw new ConnectorPermissionsUnavailableError('get');
  }

  async set(
    _connectorId: string,
    _toolName: string,
    _level: ConnectorPermissionLevel,
    _destructive = false,
  ): Promise<void> {
    throw new ConnectorPermissionsUnavailableError('set');
  }

  async list(_connectorId: string): Promise<ConnectorPermissionListing> {
    throw new ConnectorPermissionsUnavailableError('list');
  }

  async reset(): Promise<ConnectorPermissionReset> {
    throw new ConnectorPermissionsUnavailableError('reset');
  }
}

export { defaultPermissionForTool };
