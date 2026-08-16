
import { CONNECTORS } from '../data/connectors';

export interface QualifiedMcpToolName {
  serverId: string;
  toolName: string;
}

const QUALIFIED_MCP_TOOL_NAME_RE = /^mcp__([^_][^_]*)__(.+)$/;

export function parseQualifiedMcpToolName(name: string): QualifiedMcpToolName | null {
  const match = QUALIFIED_MCP_TOOL_NAME_RE.exec(name);
  if (!match || !match[1] || !match[2]) return null;
  return { serverId: match[1], toolName: match[2] };
}

const CUSTOM_CONNECTOR_SERVER_PREFIX = 'custom-';

export function isCustomConnectorServerId(serverId: string): boolean {
  return serverId.startsWith(CUSTOM_CONNECTOR_SERVER_PREFIX);
}

export interface McpToolDescription {
  serverId: string;
  toolName: string;
  label: string;
}

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
