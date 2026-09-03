import { parseQualifiedToolName } from '@/lib/mcp-tool-executor';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';

export type ToolActionClass = 'read' | 'write' | 'delete' | 'execute' | 'external_send';

export interface ToolMetadata {
  actionClass: ToolActionClass;
  reversible: boolean;
  acceptsUntrustedContent: boolean;
  createsEgressPath: boolean;
  declared: boolean;
}

export const PLATFORM_TOOL_METADATA: Readonly<Record<string, ToolMetadata>> = Object.freeze({
  web_search: {
    actionClass: 'read',
    reversible: true,
    acceptsUntrustedContent: true,
    createsEgressPath: true,
    declared: true,
  },
  search_maps: {
    actionClass: 'read',
    reversible: true,
    acceptsUntrustedContent: false,
    createsEgressPath: false,
    declared: true,
  },
  url_fetch: {
    actionClass: 'read',
    reversible: true,
    acceptsUntrustedContent: true,
    createsEgressPath: true,
    declared: true,
  },
  execute_code: {
    actionClass: 'execute',
    reversible: false,
    acceptsUntrustedContent: false,
    createsEgressPath: true,
    declared: true,
  },
  write_file: {
    actionClass: 'write',
    reversible: false,
    acceptsUntrustedContent: false,
    createsEgressPath: false,
    declared: true,
  },
  create_folder: {
    actionClass: 'write',
    reversible: true,
    acceptsUntrustedContent: false,
    createsEgressPath: false,
    declared: true,
  },
  list_files: {
    actionClass: 'read',
    reversible: true,
    acceptsUntrustedContent: false,
    createsEgressPath: false,
    declared: true,
  },
  read_file: {
    actionClass: 'read',
    reversible: true,
    acceptsUntrustedContent: true,
    createsEgressPath: false,
    declared: true,
  },
  edit_file: {
    actionClass: 'write',
    reversible: false,
    acceptsUntrustedContent: false,
    createsEgressPath: false,
    declared: true,
  },
  create_office_file: {
    actionClass: 'write',
    reversible: true,
    acceptsUntrustedContent: false,
    createsEgressPath: false,
    declared: true,
  },
  skill: {
    actionClass: 'read',
    reversible: true,
    acceptsUntrustedContent: false,
    createsEgressPath: false,
    declared: true,
  },
});

const GITHUB_TOOL_METADATA: Readonly<Record<string, ToolMetadata>> = Object.freeze({
  get_pull_request_diff: {
    actionClass: 'read',
    reversible: true,
    acceptsUntrustedContent: true,
    createsEgressPath: false,
    declared: true,
  },
  post_issue_comment: {
    actionClass: 'external_send',
    reversible: false,
    acceptsUntrustedContent: false,
    createsEgressPath: true,
    declared: true,
  },
  post_pull_request_review: {
    actionClass: 'external_send',
    reversible: false,
    acceptsUntrustedContent: false,
    createsEgressPath: true,
    declared: true,
  },
});

const CONNECTOR_TOOL_METADATA: Readonly<Record<string, Readonly<Record<string, ToolMetadata>>>> =
  Object.freeze({
    github: GITHUB_TOOL_METADATA,
  });

export const UNKNOWN_TOOL_METADATA: ToolMetadata = Object.freeze({
  actionClass: 'write',
  reversible: false,
  acceptsUntrustedContent: true,
  createsEgressPath: true,
  declared: false,
});

export function resolveToolMetadata(name: string): ToolMetadata {
  const platform = PLATFORM_TOOL_METADATA[name];
  if (platform) return platform;

  const parsed = parseQualifiedToolName(name);
  if (parsed) {
    const connector = CONNECTOR_TOOL_METADATA[parsed.serverId]?.[parsed.toolName];
    if (connector) return connector;
  }
  return UNKNOWN_TOOL_METADATA;
}

export function resolveConnectorToolMetadata(connectorId: string, toolName: string): ToolMetadata {
  return (
    CONNECTOR_TOOL_METADATA[connectorId]?.[toolName] ??
    PLATFORM_TOOL_METADATA[toolName] ??
    UNKNOWN_TOOL_METADATA
  );
}

export function isDestructiveToolMetadata(metadata: ToolMetadata): boolean {
  switch (metadata.actionClass) {
    case 'read':
      return false;
    case 'delete':
    case 'external_send':
      return true;
    case 'write':
    case 'execute':
      return !metadata.reversible;
  }
}

export function isDestructiveConnectorTool(connectorId: string, toolName: string): boolean {
  return isDestructiveToolMetadata(resolveConnectorToolMetadata(connectorId, toolName));
}

export function isParallelSafeTool(name: string): boolean {
  const metadata = resolveToolMetadata(name);
  return metadata.declared && metadata.actionClass === 'read';
}

export function toolCreatesEgressPath(name: string): boolean {
  return resolveToolMetadata(name).createsEgressPath;
}

export function toolAcceptsUntrustedContent(name: string): boolean {
  return resolveToolMetadata(name).acceptsUntrustedContent;
}

export function isSensitiveSourceTool(
  def: Pick<WebMcpToolDef, 'qualifiedName' | 'origin'>,
): boolean {
  if (PLATFORM_TOOL_METADATA[def.qualifiedName]) return false;
  return parseQualifiedToolName(def.qualifiedName) !== null || def.origin === 'connector';
}
