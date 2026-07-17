/**
 * Client-safe parsing/labeling for qualified MCP/connector tool names.
 *
 * The server injects connector tools into the model's tool list with the
 * wire name `mcp__<serverId>__<toolName>` (see `catalogToToolDefs` and
 * `parseQualifiedToolName` in `apps/web/lib/mcp-tool-executor.ts`, and
 * `GITHUB_TOOL_DEFS` in `apps/web/lib/user-connector-tools.ts`). That module
 * is `server-only` and cannot be imported from client components, so this is
 * a small, independent mirror of the same regex — keep the two in sync.
 *
 * `serverId` never contains an underscore (enforced server-side), which is
 * what keeps the `custom-<row id>` namespace (hyphen, not underscore) for a
 * user's own remote MCP connectors unambiguous from the fixed/operator ones.
 */

import { CONNECTORS } from '../data/connectors';

export interface QualifiedMcpToolName {
  serverId: string;
  toolName: string;
}

const QUALIFIED_MCP_TOOL_NAME_RE = /^mcp__([^_][^_]*)__(.+)$/;

/**
 * Parse a qualified tool name into (serverId, toolName). Returns null for
 * any name not in `mcp__<serverId>__<toolName>` form (i.e. not a
 * connector/MCP tool call).
 */
export function parseQualifiedMcpToolName(name: string): QualifiedMcpToolName | null {
  const match = QUALIFIED_MCP_TOOL_NAME_RE.exec(name);
  if (!match || !match[1] || !match[2]) return null;
  return { serverId: match[1], toolName: match[2] };
}

/** serverId prefix for a user's own custom remote MCP connectors. */
const CUSTOM_CONNECTOR_SERVER_PREFIX = 'custom-';

export function isCustomConnectorServerId(serverId: string): boolean {
  return serverId.startsWith(CUSTOM_CONNECTOR_SERVER_PREFIX);
}

export interface McpToolDescription {
  serverId: string;
  toolName: string;
  /** e.g. "GitHub · post_issue_comment" or "Custom connector · search_files" */
  label: string;
}

/**
 * Human-facing description of a qualified connector tool call, or null when
 * `name` isn't an mcp__ tool. Looks the display name up in the canonical
 * connector catalog by serverId; a user's own custom connector rows
 * (`custom-<row id>`) are NOT resolved to their row name here (that would
 * need a GET /api/connectors round-trip) — they get a generic label instead.
 */
export function describeMcpTool(name: string): McpToolDescription | null {
  const parsed = parseQualifiedMcpToolName(name);
  if (!parsed) return null;
  const { serverId, toolName } = parsed;
  if (isCustomConnectorServerId(serverId)) {
    return { serverId, toolName, label: `Custom connector · ${toolName}` };
  }
  const connector = CONNECTORS.find((c) => c.id === serverId);
  const displayName = connector?.name ?? serverId;
  return { serverId, toolName, label: `${displayName} · ${toolName}` };
}
