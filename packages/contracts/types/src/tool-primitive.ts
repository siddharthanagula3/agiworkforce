/**
 * The one tool primitive every surface maps onto (decision D-P0-5).
 *
 * The shapes are owned by `crates/agiworkforce-protocol/src/tool_primitive.rs`
 * and reach TypeScript through `pnpm generate:protocol-types`, so a member
 * added on one side cannot go missing on the other. This module adds the
 * runtime vocabulary `check:protocol-types` compares with the generated unions
 * and the classification a tool loop reads from a definition.
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

/**
 * The shape a tool declaration is written against. The primitive itself is
 * generated from the Rust protocol; this is the version of the envelope a
 * surface stores and replays.
 */
export const TOOL_SCHEMA_VERSION = 1;

export const TOOL_MIN_SCHEMA_VERSION = 1;

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

export const TOOL_SURFACES = listing<ToolSurface>()([
  'web',
  'desktop',
  'mobile',
  'cli',
  'vscode',
  'chrome',
]) satisfies readonly SourceSurface[];

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
