import 'server-only';

import {
  connectorCategoryToolName,
  isConnectorCategoryToolName,
  TOOL_APPROVAL_RISK_TIERS,
  type ToolApprovalRiskTier,
} from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { isOperatorMcpServer, parseQualifiedToolName } from '@/lib/mcp-tool-executor';
import { parseLockdownEnabled } from '@shared/types/lockdownMode';
import { readConnectorPolicy } from '@/lib/services/connector-policy-service';
import {
  resolveConnectorToolMetadata,
  connectorToolRiskTier,
  isDestructiveConnectorTool,
  type ToolAnnotations,
} from './tool-metadata';
import {
  loadConnectorToolSessionGrants,
  insertConnectorToolSessionGrants,
  NO_SESSION_GRANTS,
  revokeConnectorSessionGrants,
  type ConnectorToolSessionGrants,
  type ConnectorToolSessionScope,
  type ScopedToolApproval,
} from './connector-tool-session-grants';

export type ConnectorToolPermissionLevel = 'allow' | 'ask' | 'deny';

const DB_TO_WIRE: Readonly<Record<string, ConnectorToolPermissionLevel>> = Object.freeze({
  'always-allow': 'allow',
  'needs-approval': 'ask',
  blocked: 'deny',
});

const WIRE_TO_DB: Readonly<Record<ConnectorToolPermissionLevel, string>> = Object.freeze({
  allow: 'always-allow',
  ask: 'needs-approval',
  deny: 'blocked',
});

export class CriticalStandingAllowError extends Error {
  constructor(connectorId: string, toolName: string) {
    super(
      `${connectorId}/${toolName} can delete or send data that cannot be recovered, so it asks ` +
        'every time and cannot be allowed always.',
    );
    this.name = 'CriticalStandingAllowError';
  }
}

/**
 * The one writer of a saved verdict. Destructiveness is a safety property, not
 * a caller preference, so it is derived here, and a standing allow for a
 * critical tool is refused rather than stored. A row saved before that rule
 * stays; the tool loop asks for a critical tool whatever the row says.
 */
export async function saveConnectorToolPermissions(
  db: DatabaseAdapter,
  input: {
    userId: string;
    organizationId: string | null;
    connectorId: string;
    toolNames: readonly string[];
    level: ConnectorToolPermissionLevel;
    annotationsFor?: (toolName: string) => ToolAnnotations | undefined;
    keepBlocked?: boolean;
  },
): Promise<{ destructive: boolean; saved: boolean }> {
  const toolNames = [...new Set(input.toolNames)];
  const destructive = toolNames.map((toolName) => {
    const annotations = input.annotationsFor?.(toolName);
    if (
      input.level === 'allow' &&
      connectorToolRiskTier(input.connectorId, toolName, annotations) === 'critical'
    )
      throw new CriticalStandingAllowError(input.connectorId, toolName);
    return isConnectorCategoryToolName(toolName)
      ? toolName === connectorCategoryToolName('write')
      : isDestructiveConnectorTool(input.connectorId, toolName, annotations);
  });
  for (const toolName of toolNames)
    await revokeConnectorSessionGrants(db, input, input.connectorId, toolName);
  const rows = await db.query<{ tool_name: string }>(
    `insert into public.connector_tool_permissions
       (user_id, connector_id, tool_name, level, destructive, updated_at)
     select $1, $2, tool.name, $4, tool.destructive, now()
       from unnest($3::text[], $5::boolean[]) as tool(name, destructive)
     on conflict (user_id, connector_id, tool_name)
       do update set level = excluded.level,
                     destructive = excluded.destructive,
                     updated_at = now()
       where not $6::boolean or connector_tool_permissions.level <> 'blocked'
     returning tool_name`,
    [
      input.userId,
      input.connectorId,
      toolNames,
      WIRE_TO_DB[input.level],
      destructive,
      input.keepBlocked === true,
    ],
  );
  return { destructive: destructive.some(Boolean), saved: rows.length === toolNames.length };
}

export class ConnectorToolPermissionChangedError extends Error {
  constructor() {
    super('The tool permission changed. Review this call again.');
    this.name = 'ConnectorToolPermissionChangedError';
  }
}

export async function saveScopedConnectorToolApprovals(
  db: DatabaseAdapter,
  input: ConnectorToolSessionScope & {
    approvals: readonly ScopedToolApproval[];
    annotationsFor?: (connectorId: string, toolName: string) => ToolAnnotations | undefined;
  },
): Promise<void> {
  await db.transaction(async (transaction) => {
    for (const approval of input.approvals.filter((entry) => entry.scope === 'always')) {
      const result = await saveConnectorToolPermissions(transaction, {
        userId: input.userId,
        organizationId: input.organizationId,
        connectorId: approval.connectorId,
        toolNames: [approval.toolName],
        level: 'allow',
        annotationsFor: (name) => input.annotationsFor?.(approval.connectorId, name),
        keepBlocked: true,
      });
      if (!result.saved) throw new ConnectorToolPermissionChangedError();
    }
    await insertConnectorToolSessionGrants(
      transaction,
      input,
      input.approvals.filter((approval) => approval.scope === 'session'),
    );
  });
}

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
  /**
   * Every tool of the connector is denied whatever its name, so the catalog
   * build does not refresh its token or list its tools at all.
   */
  isConnectorDenied(connectorId: string): boolean;
  isSessionGranted?(qualifiedName: string, currentRisk?: ToolApprovalRiskTier): boolean;
  canRememberApproval?(qualifiedName: string): boolean;
  readonly sessionGrantsAvailable?: boolean;
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
    isConnectorDenied: () => false,
    canRememberApproval: (qualifiedName) => levelFor(qualifiedName) !== 'deny',
    get size() {
      return levels.size;
    },
  };
}

export const EMPTY_CONNECTOR_TOOL_PERMISSIONS: ConnectorToolPermissions = buildPermissions(
  new Map(),
);

/**
 * A conversation grant turns "ask" into "allow" for this conversation only. A
 * blocked tool stays blocked: the grant is the person's answer to a prompt,
 * and a tool that is denied never shows one. A grant recorded for a lower risk
 * than the tool now carries is not admitted.
 */
export function withSessionGrants(
  permissions: ConnectorToolPermissions,
  grants: ConnectorToolSessionGrants,
): ConnectorToolPermissions {
  if (grants.size === 0) return permissions;
  const entries = new Map(
    permissions.entries.map((entry) => [levelKey(entry.connectorId, entry.toolName), entry]),
  );
  const admitted = new Map<string, ToolApprovalRiskTier>();
  for (const [key, risk] of grants) {
    const separator = key.indexOf(' ');
    if (separator < 1 || separator === key.length - 1) continue;
    const connectorId = key.slice(0, separator);
    const toolName = key.slice(separator + 1);
    if (permissions.isConnectorToolDenied(connectorId, toolName)) continue;
    if (
      TOOL_APPROVAL_RISK_TIERS.indexOf(connectorToolRiskTier(connectorId, toolName)) >
      TOOL_APPROVAL_RISK_TIERS.indexOf(risk)
    )
      continue;
    admitted.set(key, risk);
    entries.set(key, { connectorId, toolName, level: 'allow' });
  }
  if (admitted.size === 0) return permissions;
  const granted = (
    connectorId: string,
    toolName: string,
    level: ConnectorToolPermissionLevel | undefined,
  ): ConnectorToolPermissionLevel | undefined =>
    admitted.has(levelKey(connectorId, toolName)) ? 'allow' : level;
  return {
    ...permissions,
    sessionGrantsAvailable: true,
    entries: [...entries.values()],
    size: entries.size,
    levelForConnectorTool: (connectorId, toolName) =>
      granted(connectorId, toolName, permissions.levelForConnectorTool(connectorId, toolName)),
    levelFor: (qualifiedName) => {
      const level = permissions.levelFor(qualifiedName);
      const parsed = parseQualifiedToolName(qualifiedName);
      return parsed ? granted(parsed.serverId, parsed.toolName, level) : level;
    },
    isSessionGranted: (qualifiedName, currentRisk) => {
      const parsed = parseQualifiedToolName(qualifiedName);
      const grantedRisk = parsed
        ? admitted.get(levelKey(parsed.serverId, parsed.toolName))
        : undefined;
      return (
        parsed !== null &&
        !permissions.isDenied(qualifiedName) &&
        grantedRisk !== undefined &&
        (currentRisk === undefined ||
          TOOL_APPROVAL_RISK_TIERS.indexOf(currentRisk) <=
            TOOL_APPROVAL_RISK_TIERS.indexOf(grantedRisk))
      );
    },
  };
}

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
  isConnectorDenied: () => true,
  canRememberApproval: () => false,
  sessionGrantsAvailable: false,
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
    canRememberApproval: (qualifiedName) => {
      const parsed = parseQualifiedToolName(qualifiedName);
      return (
        parsed !== null &&
        !disabledConnectorIds.has(parsed.serverId) &&
        permissions.canRememberApproval?.(qualifiedName) === true
      );
    },
    isSessionGranted: (qualifiedName, currentRisk) => {
      const parsed = parseQualifiedToolName(qualifiedName);
      return (
        parsed !== null &&
        !disabledConnectorIds.has(parsed.serverId) &&
        permissions.isSessionGranted?.(qualifiedName, currentRisk) === true
      );
    },
    isConnectorToolDenied: (connectorId, toolName) =>
      disabledConnectorIds.has(connectorId) ||
      permissions.isConnectorToolDenied(connectorId, toolName),
    isConnectorDenied: (connectorId) =>
      disabledConnectorIds.has(connectorId) || permissions.isConnectorDenied(connectorId),
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
 * granted in a chat that is kept; it does not carry into one that is not, and
 * neither does the account default that runs read-only tools unasked. Every
 * connector call inside a temporary chat is approved for that turn in front of
 * the person making it, and approving it there changes nothing outside the chat.
 *
 * `deny` is left alone in both directions: a blocked tool stays blocked, and a
 * temporary chat is not a way around a verdict the account already made.
 */
export function withoutStandingApprovals(
  permissions: ConnectorToolPermissions,
): ConnectorToolPermissions {
  const askUnlessDenied = (
    level: ConnectorToolPermissionLevel | undefined,
  ): ConnectorToolPermissionLevel => (level === 'deny' ? 'deny' : 'ask');
  const forServer = (
    serverId: string,
    level: ConnectorToolPermissionLevel | undefined,
  ): ConnectorToolPermissionLevel | undefined =>
    isOperatorMcpServer(serverId) ? level : askUnlessDenied(level);
  return {
    ...permissions,
    canRememberApproval: () => false,
    sessionGrantsAvailable: false,
    isSessionGranted: () => false,
    entries: permissions.entries.map((entry) =>
      isOperatorMcpServer(entry.connectorId)
        ? entry
        : { ...entry, level: askUnlessDenied(entry.level) },
    ),
    levelFor: (qualifiedName) => {
      const parsed = parseQualifiedToolName(qualifiedName);
      const level = permissions.levelFor(qualifiedName);
      return parsed === null ? level : forServer(parsed.serverId, level);
    },
    levelForConnectorTool: (connectorId, toolName) =>
      forServer(connectorId, permissions.levelForConnectorTool(connectorId, toolName)),
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
  const result = buildPermissions(merged);
  return {
    ...result,
    sessionGrantsAvailable: permissions.sessionGrantsAvailable,
    canRememberApproval: (qualifiedName) => {
      const parsed = parseQualifiedToolName(qualifiedName);
      if (!parsed || permissions.canRememberApproval?.(qualifiedName) !== true) return false;
      const required = lookupLevel(workspace, parsed.serverId, parsed.toolName);
      return required !== 'ask' && required !== 'deny';
    },
    isSessionGranted: (qualifiedName, currentRisk) =>
      result.levelFor(qualifiedName) === 'allow' &&
      permissions.isSessionGranted?.(qualifiedName, currentRisk) === true,
  };
}

export function connectorToolPermissionsFromEntries(
  entries: ReadonlyArray<ConnectorToolPermissionEntry>,
): ConnectorToolPermissions {
  return buildPermissions(
    new Map(entries.map((entry) => [levelKey(entry.connectorId, entry.toolName), entry.level])),
  );
}

interface PermissionRow {
  connector_id: string;
  tool_name: string;
  level: string;
}

export async function readLockdown(db: DatabaseAdapter, userId: string): Promise<boolean | null> {
  try {
    const [row] = await db.query<{ settings: unknown }>(
      'select settings from public.user_settings where user_id = $1 limit 1',
      [userId],
    );
    return parseLockdownEnabled(row?.settings ?? {});
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : error, userId },
      '[lockdown] account setting unavailable; denying connector tools',
    );
    return null;
  }
}

export async function isLockedDown(db: DatabaseAdapter, userId: string): Promise<boolean> {
  // Failing open here would hand an account that asked for lockdown its full
  // connector surface the moment a query hiccups, which is the one outcome
  // the setting exists to prevent. A read error denies.
  return (await readLockdown(db, userId)) !== false;
}

export async function loadConnectorToolPermissions(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string | null,
  session?: Pick<ConnectorToolSessionScope, 'conversationId' | 'trustBoundary'>,
): Promise<ConnectorToolPermissions> {
  if (!userId) return EMPTY_CONNECTOR_TOOL_PERMISSIONS;
  // Checked here rather than at each caller: the completions, approve and
  // resume-input routes all resolve permissions through this function, so a
  // route added later inherits lockdown instead of having to remember it.
  if (await isLockedDown(db, userId)) return LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS;
  let rows: PermissionRow[] = [];
  let standingPermissionsReadable = true;
  try {
    rows = await db.query<PermissionRow>(
      `select connector_id, tool_name, level
         from public.connector_tool_permissions
        where user_id = $1`,
      [userId],
    );
  } catch (error) {
    standingPermissionsReadable = false;
    logger.warn(
      { error: error instanceof Error ? error.message : error, userId },
      '[connector-permissions] saved tool verdicts unavailable; falling back to approval prompts',
    );
  }

  const levels = new Map<string, ConnectorToolPermissionLevel>();
  for (const row of rows) {
    const level = DB_TO_WIRE[row.level];
    if (!level) continue;
    levels.set(levelKey(row.connector_id, row.tool_name), level);
  }
  const base = buildPermissions(levels);
  const [grants, rules] = await Promise.all([
    session && standingPermissionsReadable
      ? loadConnectorToolSessionGrants(db, { ...session, userId, organizationId })
      : Promise.resolve(null),
    workspaceToolRules(db, organizationId),
  ]);
  const governed = withWorkspaceToolRules(grants ? withSessionGrants(base, grants) : base, rules);
  return {
    ...governed,
    sessionGrantsAvailable: grants !== null && grants !== NO_SESSION_GRANTS,
    canRememberApproval: (qualifiedName) =>
      standingPermissionsReadable && governed.canRememberApproval?.(qualifiedName) === true,
  };
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
