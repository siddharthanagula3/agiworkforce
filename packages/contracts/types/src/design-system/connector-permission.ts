
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

export interface ConnectorToolPermission {
  toolName: string;
  level: ConnectorPermissionLevel;
  destructive: boolean;
}

export function defaultPermissionForTool(destructive: boolean): ConnectorPermissionLevel {
  return destructive ? 'blocked' : 'needs-approval';
}

export type ConnectorPermissionStorage = 'local-vault' | 'unsupported';
