// The approval gate for one tool call, as a table: array order is precedence.
// The injection escalation below is a mitigation, not a proof.

import { isDeviceStepTool } from '@agiworkforce/local-runtime-contract';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import type { ToolApprovalPolicy } from '@shared/types/toolApprovalPolicy';
import type { ConnectorToolPermissionLevel } from './connector-tool-permissions';
import {
  isSensitiveSourceTool,
  policyAutoApprovesTool,
  toolAcceptsUntrustedContent,
  toolCreatesEgressPath,
} from './tool-metadata';

export const TOOL_CALL_GATE_REASONS = [
  'blocked_by_user_permission',
  'always_allow',
  'user_requires_approval',
  'manual_approval_mode',
  'auto_approval_mode',
  'account_default_read_only',
  'lethal_trifecta',
] as const;

export type ToolCallGateReason = (typeof TOOL_CALL_GATE_REASONS)[number];

export type ToolCallGateVerdict = 'allow' | 'ask' | 'deny';

export interface ToolCallGate {
  verdict: ToolCallGateVerdict;
  reason: ToolCallGateReason;
  /** Which row of the published precedence table decided this call. */
  rank: number;
}

/** What the turn is, shared by every call gated in it. */
export interface ToolCallGateContext {
  approvalMode: 'auto' | 'manual';
  toolApprovalPolicy: ToolApprovalPolicy;
  unattended: boolean;
  deviceHostPresent: boolean;
  untrustedContentInContext: boolean;
  sensitiveSourceAvailable: boolean;
}

/** What this one call is. */
export interface ToolCallGateRequest {
  qualifiedName: string;
  savedLevel: ConnectorToolPermissionLevel | undefined;
  batchIntroducesUntrustedContent: boolean;
}

export type ToolCallGateSubject = ToolCallGateContext &
  ToolCallGateRequest & { readonly trifecta: boolean };

// `escalate` asks interactively and denies unattended: never falls through to allow.
type ToolCallGateOutcome = ToolCallGateVerdict | 'escalate';

export interface ToolCallGateRank {
  rank: number;
  reason: ToolCallGateReason;
  outcome: ToolCallGateOutcome;
  applies: (subject: ToolCallGateSubject) => boolean;
}

export const TOOL_CALL_GATE_RANKS: readonly ToolCallGateRank[] = Object.freeze([
  {
    rank: 1,
    reason: 'blocked_by_user_permission',
    outcome: 'deny',
    applies: (subject) => subject.savedLevel === 'deny',
  },
  {
    rank: 2,
    reason: 'auto_approval_mode',
    outcome: 'allow',
    applies: (subject) => subject.deviceHostPresent && isDeviceStepTool(subject.qualifiedName),
  },
  {
    rank: 3,
    reason: 'lethal_trifecta',
    outcome: 'escalate',
    applies: (subject) => subject.savedLevel === 'allow' && subject.trifecta,
  },
  {
    rank: 4,
    reason: 'always_allow',
    outcome: 'allow',
    applies: (subject) => subject.savedLevel === 'allow',
  },
  {
    rank: 5,
    reason: 'user_requires_approval',
    outcome: 'ask',
    applies: (subject) => subject.savedLevel === 'ask',
  },
  {
    rank: 6,
    reason: 'account_default_read_only',
    outcome: 'allow',
    applies: (subject) =>
      subject.approvalMode === 'manual' &&
      !subject.trifecta &&
      policyAutoApprovesTool(subject.toolApprovalPolicy, subject.qualifiedName),
  },
  {
    rank: 7,
    reason: 'manual_approval_mode',
    outcome: 'ask',
    applies: (subject) => subject.approvalMode === 'manual',
  },
  {
    rank: 8,
    reason: 'lethal_trifecta',
    outcome: 'escalate',
    applies: (subject) => subject.trifecta,
  },
  {
    rank: 9,
    reason: 'auto_approval_mode',
    outcome: 'allow',
    applies: () => true,
  },
] satisfies readonly ToolCallGateRank[]);

// Untrusted content, a reachable sensitive source and an egress call, all at once.
// An undeclared tool counts as creating an egress path.
export function toolCallCompletesTrifecta(subject: Omit<ToolCallGateSubject, 'trifecta'>): boolean {
  return (
    (subject.untrustedContentInContext || subject.batchIntroducesUntrustedContent) &&
    subject.sensitiveSourceAvailable &&
    toolCreatesEgressPath(subject.qualifiedName)
  );
}

export function resolveToolCallGate(
  request: ToolCallGateRequest,
  context: ToolCallGateContext,
): ToolCallGate {
  const partial = { ...context, ...request };
  const subject: ToolCallGateSubject = {
    ...partial,
    trifecta: toolCallCompletesTrifecta(partial),
  };
  const lastRank = TOOL_CALL_GATE_RANKS[TOOL_CALL_GATE_RANKS.length - 1]!;
  const matched = TOOL_CALL_GATE_RANKS.find((rank) => rank.applies(subject)) ?? lastRank;
  return {
    verdict:
      matched.outcome === 'escalate' ? (context.unattended ? 'deny' : 'ask') : matched.outcome,
    reason: matched.reason,
    rank: matched.rank,
  };
}

// A batch is gated before any of it runs, so another call in it counts.
// The call being gated does not: its content does not exist yet.
export function batchIntroducesUntrustedContent(
  callId: string,
  batch: readonly { id: string; qualifiedName: string }[],
): boolean {
  return batch.some(
    (other) => other.id !== callId && toolAcceptsUntrustedContent(other.qualifiedName),
  );
}

// The U leg: raised only by a tool call already in the transcript, never by pasted content.
export function untrustedToolContentInContext(priorToolCallNames: readonly string[]): boolean {
  return priorToolCallNames.some((name) => toolAcceptsUntrustedContent(name));
}

// The S leg: derived from the offered catalog, so it over-triggers rather than under-triggers.
export function sensitiveSourceReachable(input: {
  privateContextPresent: boolean;
  offeredTools: readonly Pick<WebMcpToolDef, 'qualifiedName' | 'origin'>[];
  availableToolNames: readonly string[];
}): boolean {
  return (
    input.privateContextPresent ||
    input.offeredTools.some((def) => isSensitiveSourceTool(def)) ||
    input.availableToolNames.some((name) => isSensitiveSourceTool({ qualifiedName: name }))
  );
}
