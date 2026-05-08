/**
 * Hybrid connector permission store (Desktop P0, audit C-rank 1).
 *
 * Decision D1 (DECISIONS.md): HYBRID
 *   - Local mode (Tauri): encrypted via master_password.rs vault at
 *     `~/.agiworkforce/connector-permissions.json`
 *   - Cloud mode (non-Tauri): Supabase `connector_tool_permissions` table
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

// ── Runtime detection (inline, no @agiworkforce/runtime dep needed) ──────────

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
  return new SupabaseStore();
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

// ── Supabase Store (Cloud / Web) ─────────────────────────────────────────────

class SupabaseStore implements ConnectorPermissionStore {
  readonly storage: ConnectorPermissionStorage = 'cloud-supabase';

  /** Lazily import supabase client from the host app bundle. */
  private async getClient() {
    // Dynamically resolve the supabase singleton that the host app configures.
    // We can't import from '@/lib/supabase' (that's desktop-app relative),
    // so we use a well-known global that the host app is expected to provide.
    // Fall back to a no-op shim so the package compiles cleanly in isolation.
    const g = globalThis as Record<string, unknown>;
    if (g['__agi_supabase__']) {
      return g['__agi_supabase__'] as SupabaseClient;
    }
    return null;
  }

  async get(connectorId: string, toolName: string): Promise<ConnectorPermissionLevel | null> {
    const client = await this.getClient();
    if (!client) return null;
    const { data, error } = await client
      .from('connector_tool_permissions')
      .select('level')
      .eq('connector_id', connectorId)
      .eq('tool_name', toolName)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { level: string }).level as ConnectorPermissionLevel;
  }

  async set(
    connectorId: string,
    toolName: string,
    level: ConnectorPermissionLevel,
    destructive = false,
  ): Promise<void> {
    const client = await this.getClient();
    if (!client) return;
    const { error } = await client.from('connector_tool_permissions').upsert(
      {
        connector_id: connectorId,
        tool_name: toolName,
        level,
        destructive,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,connector_id,tool_name' },
    );
    if (error) {
      throw new Error(`[ConnectorPermissions] supabase upsert: ${error.message}`);
    }
  }

  async list(connectorId: string): Promise<ConnectorToolPermission[]> {
    const client = await this.getClient();
    if (!client) return [];
    const { data, error } = await client
      .from('connector_tool_permissions')
      .select('tool_name, level, destructive')
      .eq('connector_id', connectorId);
    if (error || !data) return [];
    return (data as Array<{ tool_name: string; level: string; destructive: boolean }>).map((r) => ({
      toolName: r.tool_name,
      level: r.level as ConnectorPermissionLevel,
      destructive: r.destructive,
    }));
  }
}

// ── Minimal Supabase client shape (structural typing, no runtime dep) ────────
//
// The real Supabase JS client returns a PostgrestFilterBuilder which is
// both thenable (resolves to {data, error}) and has terminal methods like
// maybeSingle().  We model it as a Promise-like with extra methods.

interface SupabaseResult {
  data: unknown;
  error: { message: string } | null;
}

interface SupabaseFilterBuilder extends Promise<SupabaseResult> {
  eq(col: string, val: unknown): SupabaseFilterBuilder;
  maybeSingle(): Promise<SupabaseResult>;
}

interface SupabaseQueryBuilder {
  select(cols: string): SupabaseFilterBuilder;
  upsert(values: Record<string, unknown>, opts?: { onConflict?: string }): Promise<SupabaseResult>;
}

interface SupabaseClient {
  from(table: string): SupabaseQueryBuilder;
}

// Re-export the defaultPermissionForTool helper so callers can import from one place.
export { defaultPermissionForTool };
