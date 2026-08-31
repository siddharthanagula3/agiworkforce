import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { parseQualifiedToolName } from '@/lib/mcp-tool-executor';
import { parseLockdownEnabled } from '@shared/types/lockdownMode';

export type ConnectorToolPermissionLevel = 'allow' | 'ask' | 'deny';

const DB_TO_WIRE: Readonly<Record<string, ConnectorToolPermissionLevel>> = Object.freeze({
  'always-allow': 'allow',
  'needs-approval': 'ask',
  blocked: 'deny',
});

export interface ConnectorToolPermissionEntry {
  connectorId: string;
  toolName: string;
  level: ConnectorToolPermissionLevel;
}

export interface ConnectorToolPermissions {
  readonly entries: ReadonlyArray<ConnectorToolPermissionEntry>;
  levelFor(qualifiedName: string): ConnectorToolPermissionLevel | undefined;
  levelForConnectorTool(
    connectorId: string,
    toolName: string,
  ): ConnectorToolPermissionLevel | undefined;
  isDenied(qualifiedName: string): boolean;
  isConnectorToolDenied(connectorId: string, toolName: string): boolean;
  readonly size: number;
}

function buildPermissions(
  levels: Map<string, ConnectorToolPermissionLevel>,
): ConnectorToolPermissions {
  const key = (connectorId: string, toolName: string): string => connectorId + ' ' + toolName;
  const levelForConnectorTool = (
    connectorId: string,
    toolName: string,
  ): ConnectorToolPermissionLevel | undefined => levels.get(key(connectorId, toolName));
  const levelFor = (qualifiedName: string): ConnectorToolPermissionLevel | undefined => {
    const parsed = parseQualifiedToolName(qualifiedName);
    if (!parsed) return undefined;
    return levelForConnectorTool(parsed.serverId, parsed.toolName);
  };
  const entries: ConnectorToolPermissionEntry[] = [...levels].map(([composite, level]) => {
    const separator = composite.indexOf(' ');
    return {
      connectorId: composite.slice(0, separator),
      toolName: composite.slice(separator + 1),
      level,
    };
  });
  return {
    entries,
    levelFor,
    levelForConnectorTool,
    isDenied: (qualifiedName) => levelFor(qualifiedName) === 'deny',
    isConnectorToolDenied: (connectorId, toolName) =>
      levelForConnectorTool(connectorId, toolName) === 'deny',
    get size() {
      return levels.size;
    },
  };
}

export const EMPTY_CONNECTOR_TOOL_PERMISSIONS: ConnectorToolPermissions = buildPermissions(
  new Map(),
);

/**
 * Every connector tool denied, whatever the per-tool verdicts say.
 *
 * Lockdown has to deny rather than downgrade to "ask". An injected instruction
 * arrives as ordinary model output, so the approval prompt would describe the
 * attacker's call in the attacker's words, and a reader cannot tell that from
 * a call they asked for. Denying at the catalogue means the tool is never
 * offered to the model, so there is no call to mis-approve.
 */
export const LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS: ConnectorToolPermissions = {
  entries: [],
  levelFor: () => 'deny',
  levelForConnectorTool: () => 'deny',
  isDenied: () => true,
  isConnectorToolDenied: () => true,
  size: 0,
};

export function connectorToolPermissionsFromEntries(
  entries: ReadonlyArray<ConnectorToolPermissionEntry>,
): ConnectorToolPermissions {
  return buildPermissions(
    new Map(entries.map((entry) => [entry.connectorId + ' ' + entry.toolName, entry.level])),
  );
}

const PG_UNDEFINED_TABLE = '42P01';

function isUndefinedTable(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    ((error as Record<string, unknown>)['code'] === PG_UNDEFINED_TABLE ||
      String((error as Record<string, unknown>)['message'] ?? '').includes('does not exist'))
  );
}

interface PermissionRow {
  connector_id: string;
  tool_name: string;
  level: string;
}

async function isLockedDown(db: DatabaseAdapter, userId: string): Promise<boolean> {
  try {
    const [row] = await db.query<{ settings: unknown }>(
      'select settings from public.user_settings where user_id = $1 limit 1',
      [userId],
    );
    return parseLockdownEnabled(row?.settings ?? {});
  } catch (error) {
    // Failing open here would hand an account that asked for lockdown its full
    // connector surface the moment a query hiccups, which is the one outcome
    // the setting exists to prevent. A read error denies.
    logger.warn(
      { error: error instanceof Error ? error.message : error, userId },
      '[lockdown] account setting unavailable; denying connector tools',
    );
    return true;
  }
}

export async function loadConnectorToolPermissions(
  db: DatabaseAdapter,
  userId: string,
): Promise<ConnectorToolPermissions> {
  if (!userId) return EMPTY_CONNECTOR_TOOL_PERMISSIONS;
  // Checked here rather than at each caller: the completions, approve and
  // resume-input routes all resolve permissions through this function, so a
  // route added later inherits lockdown instead of having to remember it.
  if (await isLockedDown(db, userId)) return LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS;
  let rows: PermissionRow[];
  try {
    rows = await db.query<PermissionRow>(
      `select connector_id, tool_name, level
         from public.connector_tool_permissions
        where user_id = $1`,
      [userId],
    );
  } catch (error) {
    if (!isUndefinedTable(error)) {
      logger.warn(
        { error: error instanceof Error ? error.message : error, userId },
        '[connector-permissions] saved tool verdicts unavailable; falling back to approval prompts',
      );
    }
    return EMPTY_CONNECTOR_TOOL_PERMISSIONS;
  }

  const levels = new Map<string, ConnectorToolPermissionLevel>();
  for (const row of rows) {
    const level = DB_TO_WIRE[row.level];
    if (!level) continue;
    levels.set(row.connector_id + ' ' + row.tool_name, level);
  }
  return buildPermissions(levels);
}
