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

import { deviceStepCapability, isDeviceStepTool } from '@agiworkforce/local-runtime-contract';
import { parseQualifiedToolName } from '@/lib/mcp-tool-executor';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import {
  getConnectorExecutionChannel,
  type ConnectorExecutionChannel,
} from '@/lib/connectors/catalog';
import type { ToolApprovalPolicy } from '@shared/types/toolApprovalPolicy';
import {
  isDestructiveTool,
  isParallelSafeTool as isParallelSafeContractTool,
  type ToolActionClass as ContractToolActionClass,
  type ToolApprovalReason,
  type ToolDefinition,
  type ToolPermissionDecision,
  type ToolRetrySafety,
} from '@agiworkforce/types';

export type ToolActionClass = ContractToolActionClass;

export type ToolCallVerdict = ToolPermissionDecision;

export type ToolCallReason = ToolApprovalReason;

/**
 * How much a single call can cost the user if it is wrong. Derived from the
 * four declared properties unless a tool names its own tier, which is what
 * `external_delivery: 'send'` on money and mail needs.
 */
export const TOOL_RISK_TIERS = ['low', 'medium', 'high', 'critical'] as const;
export type ToolRiskTier = (typeof TOOL_RISK_TIERS)[number];

export type ToolExternalDelivery = 'draft' | 'send';

export interface ToolMetadata {
  actionClass: ToolActionClass;
  reversible: boolean;
  acceptsUntrustedContent: boolean;
  createsEgressPath: boolean;
  declared: boolean;
  /** Overrides the derived tier. Only ever raises it. */
  riskTier?: ToolRiskTier;
  /**
   * Whether repeating the call repeats the effect. `at_most_once` is the
   * payment case: a retry after an unknown outcome can charge twice.
   */
  retrySafety?: ToolRetrySafety;
  /**
   * For a tool that puts something in front of another person: `draft` leaves
   * it for the user to send, `send` delivers it on the call.
   */
  externalDelivery?: ToolExternalDelivery;
  /**
   * Runs without asking under the read-only policy even though it reaches the
   * public internet or the sandbox: web search, page fetch and sandboxed code
   * are the leaders' automatic tools (D-2026-09-15-01). Never set on a tool
   * that can write, send, buy, change credentials or touch the user's machine.
   */
  autoInReadOnlyMode?: boolean;
}

export const PLATFORM_TOOL_METADATA: Readonly<Record<string, ToolMetadata>> = Object.freeze({
  web_search: {
    actionClass: 'read',
    reversible: true,
    acceptsUntrustedContent: true,
    createsEgressPath: true,
    declared: true,
    autoInReadOnlyMode: true,
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
    autoInReadOnlyMode: true,
  },
  execute_code: {
    actionClass: 'execute',
    reversible: false,
    acceptsUntrustedContent: false,
    createsEgressPath: true,
    declared: true,
    autoInReadOnlyMode: true,
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
    externalDelivery: 'send',
    retrySafety: 'at_most_once',
  },
  post_pull_request_review: {
    actionClass: 'external_send',
    reversible: false,
    acceptsUntrustedContent: false,
    createsEgressPath: true,
    declared: true,
    externalDelivery: 'send',
    retrySafety: 'at_most_once',
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

function deriveRiskTier(metadata: ToolMetadata): ToolRiskTier {
  if (metadata.actionClass === 'read') return 'low';
  if (metadata.actionClass === 'delete' || metadata.actionClass === 'external_send') {
    return metadata.reversible ? 'high' : 'critical';
  }
  return metadata.reversible ? 'medium' : 'high';
}

export function toolRiskTier(name: string): ToolRiskTier {
  const metadata = resolveToolMetadata(name);
  const derived = deriveRiskTier(metadata);
  if (!metadata.riskTier) return derived;
  return TOOL_RISK_TIERS.indexOf(metadata.riskTier) > TOOL_RISK_TIERS.indexOf(derived)
    ? metadata.riskTier
    : derived;
}

export function toolRetrySafety(name: string): ToolRetrySafety {
  const metadata = resolveToolMetadata(name);
  if (metadata.retrySafety) return metadata.retrySafety;
  if (metadata.actionClass === 'read') return 'idempotent';
  if (metadata.actionClass === 'delete' || metadata.actionClass === 'external_send') {
    return 'at_most_once';
  }
  return 'unknown';
}

export function toolExternalDelivery(name: string): ToolExternalDelivery | null {
  return resolveToolMetadata(name).externalDelivery ?? null;
}

/**
 * Which instrument the call reaches the world with. A step that moves the
 * pointer over whatever is on screen is `automation`, driving a page is
 * `browser`, and everything else is a structured API.
 */
export function toolExecutionChannel(qualifiedName: string): ConnectorExecutionChannel {
  if (isDeviceStepTool(qualifiedName)) {
    return deviceStepCapability(qualifiedName) === 'computer.use' ? 'automation' : 'connector';
  }
  const parsed = parseQualifiedToolName(qualifiedName);
  return parsed ? getConnectorExecutionChannel(parsed.serverId) : 'connector';
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
    retrySafety: toolRetrySafety(def.qualifiedName),
    declared: metadata.declared,
  };
}

/**
 * Does the account's standing policy let this tool run without asking?
 *
 * Lives beside the metadata rather than in `tool-approval-policy.ts`, which is
 * `server-only` for its database read. The predicate is pure, and the tool-loop
 * routing that decides whether a turn needs an approval mode at all has to be
 * able to ask it without pulling a server-only module into its import graph.
 *
 * `ask_every_time` auto-approves nothing, which is what the setting says. Under
 * `auto_approve_read_only` a tool runs on its own when it is all four things:
 * declared by us (an MCP or connector tool we know nothing about never
 * qualifies), observing rather than changing state, undoable, and unable to
 * move bytes outside the trust boundary; or when its metadata names it one of
 * the leaders' automatic tools, web search, page fetch and sandboxed code
 * (D-2026-09-15-01).
 *
 * `autonomous` is a superset: the same tools plus everything not classified as
 * destructive. An undeclared MCP or connector tool still asks, because
 * `UNKNOWN_TOOL_METADATA` is an irreversible write. The remaining hard blocks,
 * a per-tool `deny` and the lethal-trifecta escalation, are decided by the gate
 * before this predicate is reached.
 */
export function policyAutoApprovesTool(policy: ToolApprovalPolicy, qualifiedName: string): boolean {
  if (policy === 'ask_every_time') return false;
  const metadata = resolveToolMetadata(qualifiedName);
  if (metadata.declared && metadata.autoInReadOnlyMode === true) return true;
  if (policy === 'autonomous') return !isDestructiveToolMetadata(metadata);
  return (
    metadata.declared &&
    metadata.actionClass === 'read' &&
    metadata.reversible &&
    !metadata.createsEgressPath
  );
}
