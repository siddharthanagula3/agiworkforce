/**
 * @file Server-side reader for the user's persisted connector tool verdicts
 * (findings CON-1 and CON-2).
 *
 * `connector_tool_permissions` has been written by `/api/connectors/permissions`
 * since it shipped, but NOTHING on the server ever read it: the 3-state verdict
 * (allow / ask / deny) was enforced only in the browser, in
 * `useChatStream.ts`'s `autoResolvePendingApprovals`. A POST straight to
 * `/api/llm/v1/chat/completions/approve` with `{decision:"approved"}` therefore
 * executed a tool the user had explicitly Blocked, and a blocked tool was still
 * advertised to the model on every turn so its approval card kept reappearing.
 *
 * This module loads those verdicts once per turn so the tool loop can enforce
 * them BEFORE any side effect, on both the initial loop and the `/approve`
 * resume path.
 *
 * VOCABULARY: the table stores the canonical values
 * (`always-allow` | `needs-approval` | `blocked`); the wire and this module use
 * the composer's (`allow` | `ask` | `deny`), matching
 * `/api/connectors/permissions`.
 */

import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { parseQualifiedToolName } from '@/lib/mcp-tool-executor';

export type ConnectorToolPermissionLevel = 'allow' | 'ask' | 'deny';

const DB_TO_WIRE: Readonly<Record<string, ConnectorToolPermissionLevel>> = Object.freeze({
  'always-allow': 'allow',
  'needs-approval': 'ask',
  blocked: 'deny',
});

export interface ConnectorToolPermissions {
  /**
   * The user's saved verdict for a connector tool, or `undefined` when they
   * never expressed one (the loop then falls back to the turn's approval mode).
   */
  levelFor(qualifiedName: string): ConnectorToolPermissionLevel | undefined;
  levelForConnectorTool(
    connectorId: string,
    toolName: string,
  ): ConnectorToolPermissionLevel | undefined;
  /** True when the user Blocked this tool. Never execute, never advertise. */
  isDenied(qualifiedName: string): boolean;
  /** Catalog-filter predicate shape used by `loadUserConnectorToolDefs` (CON-2). */
  isConnectorToolDenied(connectorId: string, toolName: string): boolean;
  /** Number of saved verdicts (0 for the empty set). */
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
  return {
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

/** No saved verdicts — every tool falls back to the turn's approval mode. */
export const EMPTY_CONNECTOR_TOOL_PERMISSIONS: ConnectorToolPermissions = buildPermissions(
  new Map(),
);

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

/**
 * Load every saved verdict for `userId`.
 *
 * FAIL-OPEN IS DELIBERATE AND BOUNDED: if the table is missing or the query
 * fails we return the empty set, which means "no saved verdicts" — every tool
 * then falls back to the turn's approval mode, which for connector tools is
 * `manual` (fail-closed: the user is asked). It does NOT mean "everything is
 * allowed". The one verdict that would be lost is `deny`, and losing it
 * degrades to an approval prompt, never to a silent execution.
 *
 * `db` must be the caller's user-scoped (RLS) adapter; migration 0069 adds the
 * `current_app_user_id()` policy that makes the scoping enforceable in the
 * database rather than only in this WHERE clause.
 */
export async function loadConnectorToolPermissions(
  db: DatabaseAdapter,
  userId: string,
): Promise<ConnectorToolPermissions> {
  if (!userId) return EMPTY_CONNECTOR_TOOL_PERMISSIONS;
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
    // An unrecognized stored level is treated as "no verdict" rather than as
    // allow — an unknown value must never widen access.
    if (!level) continue;
    levels.set(row.connector_id + ' ' + row.tool_name, level);
  }
  return buildPermissions(levels);
}
