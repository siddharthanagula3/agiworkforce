// packages/types/src/design-system/connector-permission.ts

/**
 * Per-tool permission level for connectors (MCP servers, integrations).
 * Locked schema for desktop P0 (audit C-rank 5) and web P1 (C-rank 26).
 */
export type ConnectorPermissionLevel = 'always-allow' | 'needs-approval' | 'blocked';

export const CONNECTOR_PERMISSION_LABEL: Readonly<Record<ConnectorPermissionLevel, string>> =
  Object.freeze({
    'always-allow': 'Always allow',
    'needs-approval': 'Needs approval',
    blocked: 'Blocked',
  });

export const CONNECTOR_PERMISSION_DESCRIPTION: Readonly<Record<ConnectorPermissionLevel, string>> =
  Object.freeze({
    'always-allow': 'This tool runs without asking',
    'needs-approval': 'Confirm each invocation',
    blocked: 'Tool cannot be used',
  });

/** Per-connector tool config. Used by Settings → Connector detail view. */
export interface ConnectorToolPermission {
  toolName: string;
  level: ConnectorPermissionLevel;
  /** True for write/delete tools — UI shows a warning badge. */
  destructive: boolean;
}

/** Default permission for newly discovered tools. Destructive defaults to 'blocked'. */
export function defaultPermissionForTool(destructive: boolean): ConnectorPermissionLevel {
  return destructive ? 'blocked' : 'needs-approval';
}

/**
 * Storage location enum — per DECISIONS.md D1.
 * Resolved at runtime via packages/runtime/src/detect.ts.
 */
export type ConnectorPermissionStorage = 'local-vault' | 'cloud-supabase';
