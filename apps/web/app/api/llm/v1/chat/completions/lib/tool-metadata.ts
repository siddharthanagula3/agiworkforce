/**
 * @file Server-owned tool metadata model (finding CON-10).
 *
 * WHY THIS EXISTS: destructiveness used to be a five-substring guess
 * (`name.includes('delete') || includes('write') || includes('create') ||
 * includes('update') || includes('remove')`) duplicated in
 * `apps/desktop/src/features/connectors/ConnectorGallery.tsx` and
 * `apps/desktop/src-tauri/src/core/llm/tool_executor/mod.rs`. That guess
 * classifies `send_email`, `post_message`, `post_issue_comment`,
 * `share_document`, `publish`, `deploy`, `revoke` and `invite` as
 * NON-destructive: including two of the three shipped GitHub connector tools.
 * A published comment cannot be un-published, so treating it as harmless is a
 * real safety defect, not a cosmetic one.
 *
 * This module replaces the guess with an explicit, declared model. Every tool
 * the platform ships declares four properties:
 *
 *   - `actionClass`, what the call DOES:
 *       'read'           observes state, changes nothing
 *       'write'          creates or mutates state inside our trust boundary
 *       'delete'         destroys state
 *       'execute'        runs caller-supplied code
 *       'external_send'  emits something into a third-party system where other
 *                        people can see it (comments, reviews, messages, mail)
 *   - `reversible`, whether the caller can undo the effect from inside the
 *                      product afterwards. A sandbox folder is reversible; a
 *                      posted GitHub comment is not (it fires notifications and
 *                      may be mirrored to email before any deletion).
 *   - `acceptsUntrustedContent`, whether the tool RETURNS content authored by
 *                      someone other than the user (web pages, search results,
 *                      pull-request diffs). Such content lands in the model
 *                      context and is a prompt-injection carrier.
 *   - `createsEgressPath`, whether calling the tool can move bytes out of the
 *                      trust boundary in an attacker-influenceable way (a URL,
 *                      a query string, a comment body, arbitrary sandbox
 *                      network access).
 *
 * NOT `server-only`: this is a pure lookup table with no I/O, imported by the
 * agentic tool loop AND by `/api/connectors/permissions` (which derives the
 * persisted `destructive` column from it, finding CON-9, instead of trusting
 * a client-supplied boolean the live web client never even sends).
 */

import { parseQualifiedToolName } from '@/lib/mcp-tool-executor';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import {
  isDestructiveTool,
  isParallelSafeTool as isParallelSafeContractTool,
  type ToolActionClass as ContractToolActionClass,
  type ToolApprovalReason,
  type ToolDefinition,
  type ToolPermissionDecision,
} from '@agiworkforce/types';

export type ToolActionClass = ContractToolActionClass;

export type ToolCallVerdict = ToolPermissionDecision;

export type ToolCallReason = ToolApprovalReason;

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
  return isDestructiveTool(metadata);
}

export function isDestructiveConnectorTool(connectorId: string, toolName: string): boolean {
  return isDestructiveToolMetadata(resolveConnectorToolMetadata(connectorId, toolName));
}

/**
 * Parallel-safety (finding SYS-25). Only DECLARED read-class tools may run
 * concurrently: they observe state and cannot race each other. Everything else
 *, writes, deletes, executions, external sends, and every undeclared MCP tool
 *, serializes, preserving the loop's "mutating tools are serial" guarantee.
 */
export function isParallelSafeTool(name: string): boolean {
  return isParallelSafeContractTool(resolveToolMetadata(name));
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

function toolAuthRequirement(def: WebMcpToolDef): ToolDefinition['auth'] {
  const parsed = parseQualifiedToolName(def.qualifiedName);
  const connectorId = def.origin === 'connector' ? (parsed?.serverId ?? def.serverId) : undefined;
  if (!connectorId) return { kind: 'user_session', scopes: [] };
  return { kind: 'connector_grant', connectorId, scopes: [] };
}

/**
 * The web declaration expressed as the cross-surface tool primitive
 * (decision D-P0-5). `category` is passed in rather than re-derived: the
 * activity-feed resolver in the tool loop owns that mapping and needs the
 * offered-tool list to answer it.
 */
export function toContractToolDefinition(
  def: WebMcpToolDef,
  category: ToolDefinition['category'],
): ToolDefinition {
  const metadata = resolveToolMetadata(def.qualifiedName);
  return {
    name: def.qualifiedName,
    description: def.description,
    inputSchema: def.inputSchema,
    category,
    actionClass: metadata.actionClass,
    auth: toolAuthRequirement(def),
    reversible: metadata.reversible,
    acceptsUntrustedContent: metadata.acceptsUntrustedContent,
    createsEgressPath: metadata.createsEgressPath,
    retrySafety: metadata.actionClass === 'read' ? 'idempotent' : 'unknown',
    declared: metadata.declared,
  };
}
