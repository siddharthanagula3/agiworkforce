import 'server-only';

import { connectorCategoryToolName } from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { parseQualifiedToolName } from '@/lib/mcp-tool-executor';
import { parseLockdownEnabled } from '@shared/types/lockdownMode';
import { readConnectorPolicy } from '@/lib/services/connector-policy-service';
import { resolveConnectorToolMetadata } from './tool-metadata';

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

function levelKey(connectorId: string, toolName: string): string {
  return connectorId + ' ' + toolName;
}

function lookupLevel(
  levels: ReadonlyMap<string, ConnectorToolPermissionLevel>,
  connectorId: string,
  toolName: string,
): ConnectorToolPermissionLevel | undefined {
  return (
    levels.get(levelKey(connectorId, toolName)) ??
    levels.get(
      levelKey(
        connectorId,
        connectorCategoryToolName(
          resolveConnectorToolMetadata(connectorId, toolName).actionClass === 'read'
            ? 'read_only'
            : 'write',
        ),
      ),
    )
  );
}

function buildPermissions(
  levels: Map<string, ConnectorToolPermissionLevel>,
): ConnectorToolPermissions {
  const levelForConnectorTool = (
    connectorId: string,
    toolName: string,
  ): ConnectorToolPermissionLevel | undefined => lookupLevel(levels, connectorId, toolName);
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

/**
 * Layers a per-conversation connector opt-out on top of a user's standing
 * allow/ask/deny verdicts. Neither replaces the other: a connector switched
 * off for one chat stays off for that catalog build, while every other
 * conversation keeps reading the saved verdicts unchanged.
 */
export function withDisabledConnectorIds(
  permissions: ConnectorToolPermissions,
  disabledConnectorIds: ReadonlySet<string>,
): ConnectorToolPermissions {
  if (disabledConnectorIds.size === 0) return permissions;
  return {
    ...permissions,
    isConnectorToolDenied: (connectorId, toolName) =>
      disabledConnectorIds.has(connectorId) ||
      permissions.isConnectorToolDenied(connectorId, toolName),
    isDenied: (qualifiedName) => {
      const parsed = parseQualifiedToolName(qualifiedName);
      return (
        (parsed !== null && disabledConnectorIds.has(parsed.serverId)) ||
        permissions.isDenied(qualifiedName)
      );
    },
  };
}

/**
 * Temporary Chat's connector policy (§18). A standing "always allow" was
 * granted in a chat that is kept; it does not carry into one that is not. Every
 * allow becomes an ask, so a connector call inside a temporary chat is approved
 * for that turn in front of the person making it, and approving it there
 * changes nothing outside the chat.
 *
 * `deny` is left alone in both directions: a blocked tool stays blocked, and a
 * temporary chat is not a way around a verdict the account already made.
 */
export function withoutStandingApprovals(
  permissions: ConnectorToolPermissions,
): ConnectorToolPermissions {
  const askInsteadOfAllow = (
    level: ConnectorToolPermissionLevel | undefined,
  ): ConnectorToolPermissionLevel | undefined => (level === 'allow' ? 'ask' : level);
  return {
    ...permissions,
    entries: permissions.entries.map((entry) => ({
      ...entry,
      level: askInsteadOfAllow(entry.level) ?? entry.level,
    })),
    levelFor: (qualifiedName) => askInsteadOfAllow(permissions.levelFor(qualifiedName)),
    levelForConnectorTool: (connectorId, toolName) =>
      askInsteadOfAllow(permissions.levelForConnectorTool(connectorId, toolName)),
  };
}

/**
 * A workspace administrator's verdicts on connector tools, merged into each
 * member's own. The stricter answer wins: a workspace block or approval
 * requirement holds whatever the member saved, and a workspace allow only
 * settles tools the member has not decided on. The result is a plain set of
 * entries, so a durable run that stores and rebuilds them keeps the same
 * effective verdicts.
 */
export function withWorkspaceToolRules(
  permissions: ConnectorToolPermissions,
  rules: ReadonlyArray<ConnectorToolPermissionEntry>,
): ConnectorToolPermissions {
  if (rules.length === 0) return permissions;
  const member = new Map(
    permissions.entries.map((entry) => [levelKey(entry.connectorId, entry.toolName), entry.level]),
  );
  const workspace = new Map(
    rules.map((rule) => [levelKey(rule.connectorId, rule.toolName), rule.level]),
  );
  const merged = new Map<string, ConnectorToolPermissionLevel>();
  for (const entry of [...permissions.entries, ...rules]) {
    const key = levelKey(entry.connectorId, entry.toolName);
    if (merged.has(key)) continue;
    const own = lookupLevel(member, entry.connectorId, entry.toolName);
    const ruled = lookupLevel(workspace, entry.connectorId, entry.toolName);
    const level =
      ruled === 'deny' || own === 'deny'
        ? 'deny'
        : ruled === 'ask' || own === 'ask'
          ? 'ask'
          : (own ?? ruled);
    if (level) merged.set(key, level);
  }
  return buildPermissions(merged);
}

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

export async function isLockedDown(db: DatabaseAdapter, userId: string): Promise<boolean> {
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
  organizationId: string | null,
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
    return withWorkspaceToolRules(
      EMPTY_CONNECTOR_TOOL_PERMISSIONS,
      await workspaceToolRules(db, organizationId),
    );
  }

  const levels = new Map<string, ConnectorToolPermissionLevel>();
  for (const row of rows) {
    const level = DB_TO_WIRE[row.level];
    if (!level) continue;
    levels.set(levelKey(row.connector_id, row.tool_name), level);
  }
  return withWorkspaceToolRules(
    buildPermissions(levels),
    await workspaceToolRules(db, organizationId),
  );
}

async function workspaceToolRules(
  db: DatabaseAdapter,
  organizationId: string | null,
): Promise<ReadonlyArray<ConnectorToolPermissionEntry>> {
  const policy = organizationId ? await readConnectorPolicy(db, organizationId) : null;
  return policy?.toolRules ?? [];
}

/**
 * The verdicts one turn runs under: the saved ones, every allow turned into an
 * ask in a temporary chat, and the connectors this chat switched off denied.
 * The turn start and every route that resumes a paused turn build the same
 * view, so a resume never offers a connector its turn had withheld.
 */
export function scopeConnectorPermissionsToTurn(
  permissions: ConnectorToolPermissions,
  turn: { temporary: boolean; disabledConnectorIds: readonly string[] | undefined },
): ConnectorToolPermissions {
  return withDisabledConnectorIds(
    turn.temporary ? withoutStandingApprovals(permissions) : permissions,
    new Set(turn.disabledConnectorIds),
  );
}
