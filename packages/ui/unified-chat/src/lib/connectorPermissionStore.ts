/**
 * Connector permission store.
 *
 *   - Tauri (Desktop): encrypted via master_password.rs vault at
 *     `~/.agiworkforce/connector-permissions.json`, reached through the
 *     `connector_permission_*` Tauri commands. This is also what the Rust tool
 *     executor reads when it enforces a permission, so the UI and the
 *     enforcement point share one source of truth.
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

// ── Runtime detection (inline, no @agiworkforce/client-runtime dep needed) ──────────

const isTauriEnv: boolean =
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

// ── Public interface ─────────────────────────────────────────────────────────

export interface ConnectorPermissionStore {
  /** Which backend is active. */
  storage: ConnectorPermissionStorage;

  /**
   * Get the saved permission level for a tool, or `null` if not yet
   * configured (caller should apply `defaultPermissionForTool(destructive)`).
   */
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

  /** List all saved permissions for a connector. */
  list(connectorId: string): Promise<ConnectorToolPermission[]>;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function getConnectorPermissionStore(): ConnectorPermissionStore {
  if (isTauriEnv) {
    return new LocalVaultStore();
  }
  return new UnsupportedRuntimeStore();
}

// ── Local Vault Store (Tauri / Desktop) ──────────────────────────────────────

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

  async list(connectorId: string): Promise<ConnectorToolPermission[]> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const raw = await invoke<Array<{ toolName: string; level: string; destructive: boolean }>>(
        'connector_permission_list',
        { connectorId },
      );
      return raw.map((r) => ({
        toolName: r.toolName,
        level: r.level as ConnectorPermissionLevel,
        destructive: r.destructive,
      }));
    } catch (err) {
      console.warn('[ConnectorPermissions] list failed:', err);
      return [];
    }
  }
}

// ── Unsupported runtime (non-Tauri) ─────────────────────────────────────────
//
// CON-26: this used to return a `CloudStore` whose `getClient()` resolved
// `globalThis['__agi_cloud_db__']` — a global set nowhere in the repo. Every
// `set()` therefore returned a resolved promise having written nothing, and the
// UI rendered a successful save; `get()`/`list()` returned null/[] as though the
// user had simply never configured a permission. The queries were also
// Supabase-shaped (`.from().select().eq().maybeSingle()`, `upsert` with
// `onConflict`) against a stack from which Supabase has been removed, so even a
// wired-up client would not have matched. A permission control that silently
// discards writes is worse than no control at all.
//
// Connector tool permissions are enforced by the Rust side reading the
// encrypted local vault (`connector_permission_get`/`_set`/`_list`). There is no
// cloud-backed equivalent today, so a non-Tauri runtime must fail loudly rather
// than pretend.

/** Thrown when connector permissions are used outside the Tauri desktop runtime. */
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

  async list(_connectorId: string): Promise<ConnectorToolPermission[]> {
    throw new ConnectorPermissionsUnavailableError('list');
  }
}

// Re-export the defaultPermissionForTool helper so callers can import from one place.
export { defaultPermissionForTool };
