/**
 * The one tool primitive every surface maps onto (decision D-P0-5).
 *
 * The shapes are owned by `crates/agiworkforce-protocol/src/tool_primitive.rs`
 * and reach TypeScript through `pnpm generate:protocol-types`, so a member
 * added on one side cannot go missing on the other. This module adds the
 * runtime vocabulary, the membership guards, and the adapters that let a
 * surface declare an existing tool through the contract without changing how
 * it executes.
 *
 * @module tool-primitive
 * @packageDocumentation
 */

import type {
  ToolActionClass,
  ToolApprovalDecision,
  ToolApprovalOutcome,
  ToolApprovalReason,
  ToolApprovalRequest,
  ToolArtifact,
  ToolArtifactKind,
  ToolAuditRecord,
  ToolAuthKind,
  ToolAuthRequirement,
  ToolCostHints,
  ToolDefinition,
  ToolErrorClass,
  ToolPermission,
  ToolPermissionDecision,
  ToolPermissionScope,
  ToolResult,
  ToolResultStatus,
  ToolRetrySafety,
  ToolSurface,
} from './generated/protocol/index';
import type { SourceSurface } from './suite-contracts';

export type {
  ToolActionClass,
  ToolApprovalDecision,
  ToolApprovalOutcome,
  ToolApprovalReason,
  ToolApprovalRequest,
  ToolArtifact,
  ToolArtifactKind,
  ToolAuditRecord,
  ToolAuthKind,
  ToolAuthRequirement,
  ToolCostHints,
  ToolDefinition,
  ToolErrorClass,
  ToolPermission,
  ToolPermissionDecision,
  ToolPermissionScope,
  ToolResult,
  ToolResultStatus,
  ToolRetrySafety,
  ToolSurface,
};

const listing =
  <Union extends string>() =>
  <const Values extends readonly Union[]>(
    values: [Exclude<Union, Values[number]>] extends [never] ? Values : never,
  ): Values =>
    values;

const membership = <Union extends string>(values: readonly Union[]) => {
  const allowed: ReadonlySet<string> = new Set<string>(values);
  return (value: unknown): value is Union => typeof value === 'string' && allowed.has(value);
};

export const TOOL_ACTION_CLASSES = listing<ToolActionClass>()([
  'read',
  'write',
  'delete',
  'execute',
  'external_send',
]);

export const TOOL_PERMISSION_DECISIONS = listing<ToolPermissionDecision>()([
  'allow',
  'ask',
  'deny',
]);

export const TOOL_PERMISSION_SCOPES = listing<ToolPermissionScope>()([
  'single_call',
  'session',
  'account',
  'organization',
]);

export const TOOL_APPROVAL_REASONS = listing<ToolApprovalReason>()([
  'blocked_by_user_permission',
  'always_allow',
  'user_requires_approval',
  'manual_approval_mode',
  'auto_approval_mode',
  'account_default_read_only',
  'lethal_trifecta',
  'never_rememberable',
  'risk_tier',
  'policy_hard_block',
  'harness_limit',
]);

export const TOOL_APPROVAL_OUTCOMES = listing<ToolApprovalOutcome>()([
  'approved',
  'denied',
  'timed_out',
  'cancelled',
]);

export const TOOL_RESULT_STATUSES = listing<ToolResultStatus>()(['ok', 'error']);

export const TOOL_ERROR_CLASSES = listing<ToolErrorClass>()([
  'invalid_arguments',
  'unauthorized',
  'permission_denied',
  'not_found',
  'rate_limited',
  'timeout',
  'upstream',
  'cancelled',
  'internal',
]);

export const TOOL_RETRY_SAFETY_CLASSES = listing<ToolRetrySafety>()([
  'idempotent',
  'at_most_once',
  'unknown',
]);

export const TOOL_AUTH_KINDS = listing<ToolAuthKind>()([
  'none',
  'user_session',
  'connector_grant',
  'operator_credential',
]);

export const TOOL_ARTIFACT_KINDS = listing<ToolArtifactKind>()([
  'file',
  'image',
  'url',
  'json',
  'text',
]);

export const TOOL_SURFACES = listing<ToolSurface>()([
  'web',
  'desktop',
  'mobile',
  'cli',
  'vscode',
  'chrome',
]) satisfies readonly SourceSurface[];

export const isToolActionClass = membership<ToolActionClass>(TOOL_ACTION_CLASSES);
export const isToolPermissionDecision =
  membership<ToolPermissionDecision>(TOOL_PERMISSION_DECISIONS);
export const isToolPermissionScope = membership<ToolPermissionScope>(TOOL_PERMISSION_SCOPES);
export const isToolApprovalReason = membership<ToolApprovalReason>(TOOL_APPROVAL_REASONS);
export const isToolApprovalOutcome = membership<ToolApprovalOutcome>(TOOL_APPROVAL_OUTCOMES);
export const isToolResultStatus = membership<ToolResultStatus>(TOOL_RESULT_STATUSES);
export const isToolErrorClass = membership<ToolErrorClass>(TOOL_ERROR_CLASSES);
export const isToolRetrySafety = membership<ToolRetrySafety>(TOOL_RETRY_SAFETY_CLASSES);
export const isToolAuthKind = membership<ToolAuthKind>(TOOL_AUTH_KINDS);
export const isToolSurface = membership<ToolSurface>(TOOL_SURFACES);

const ESCALATION_REASONS: readonly ToolApprovalReason[] = ['lethal_trifecta', 'never_rememberable'];

/**
 * An escalation may never be answered by a grant given earlier. On an
 * unattended run there is no one to ask, so the caller denies rather than
 * falling through to auto-allow.
 */
export function isEscalationReason(reason: ToolApprovalReason): boolean {
  return ESCALATION_REASONS.includes(reason);
}

export function undeclaredToolDefinition(
  name: string,
  description: string,
  inputSchema: ToolDefinition['inputSchema'],
): ToolDefinition {
  return {
    name,
    description,
    inputSchema,
    category: 'other',
    actionClass: 'write',
    auth: { kind: 'user_session', scopes: [] },
    reversible: false,
    acceptsUntrustedContent: true,
    createsEgressPath: true,
    retrySafety: 'unknown',
    declared: false,
  };
}

export function isDestructiveTool(
  definition: Pick<ToolDefinition, 'actionClass' | 'reversible'>,
): boolean {
  switch (definition.actionClass) {
    case 'read':
      return false;
    case 'delete':
    case 'external_send':
      return true;
    case 'write':
    case 'execute':
      return !definition.reversible;
  }
}

export function isParallelSafeTool(
  definition: Pick<ToolDefinition, 'actionClass' | 'declared'>,
): boolean {
  return definition.declared && definition.actionClass === 'read';
}

/**
 * A permission a surface refuses to persist collapses to the call it was
 * granted for, whatever scope the caller asked for.
 */
export function toolPermission(
  tool: string,
  decision: ToolPermissionDecision,
  scope: ToolPermissionScope,
  rememberable: boolean,
): ToolPermission {
  return { tool, decision, scope: rememberable ? scope : 'single_call', rememberable };
}

/**
 * The MCP catalog descriptor as this contract reads it. Structural on purpose:
 * a server's declared shape is data crossing a trust boundary, not a package
 * this contract may depend on.
 */
export interface McpToolDescriptor {
  serverName: string;
  toolName: string;
  description?: string;
  fallbackDescription: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export function qualifiedMcpToolName(descriptor: McpToolDescriptor): string {
  return ['mcp', descriptor.serverName, descriptor.toolName].join('__');
}

/**
 * An MCP server declares a name and a schema, never what its tool does to the
 * world, so every descriptor yields an undeclared definition until an operator
 * or a connector catalog says otherwise.
 */
export function toolDefinitionFromMcpDescriptor(descriptor: McpToolDescriptor): ToolDefinition {
  const definition = undeclaredToolDefinition(
    qualifiedMcpToolName(descriptor),
    descriptor.description ?? descriptor.fallbackDescription,
    descriptor.inputSchema,
  );
  return {
    ...definition,
    category: 'mcp',
    auth: { kind: 'connector_grant', connectorId: descriptor.serverName, scopes: [] },
    ...(descriptor.outputSchema ? { outputSchema: descriptor.outputSchema } : {}),
  };
}
