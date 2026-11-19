import {
  finishAgentActivityLocally,
  isGenerationProgressEntry,
  isLocalPlaceholderActivityEntry,
  type AgentActivityEntry,
  type AgentActivityState,
  type AgentActivityToolEntry,
} from '@agiworkforce/client-runtime';
import type { LifecycleStatus, ToolStatus } from '@agiworkforce/types';
import type { ChatMessage, ToolCall } from '@/types/chat';
import { readAgentActivityState } from './agentActivityState';
import { EMPTY_RESPONSE_FAILURE } from './messageStreamError';

const AWAITING_APPROVAL = 'awaiting-approval' satisfies ToolStatus;
const PENDING = 'pending' satisfies ToolStatus;
const RUNNING = 'running' satisfies ToolStatus;
const FAILED = 'failed' satisfies ToolStatus;
const PARTIAL = 'partial' satisfies ToolStatus;
const COMPLETED = 'completed' satisfies LifecycleStatus;
const CANCELLED = 'cancelled' satisfies LifecycleStatus;

export type LiveRunState = 'live' | 'ended' | 'unknown';

const STOPPED_FINISH_REASONS: ReadonlySet<string> = new Set(['stopped', 'cancelled', 'canceled']);

export function isStoppedFinishReason(finishReason: unknown): boolean {
  return typeof finishReason === 'string' && STOPPED_FINISH_REASONS.has(finishReason);
}

export interface SettledTurnInput {
  toolCalls?: readonly ToolCall[];
  streaming: boolean;
  hasText: boolean;
  liveRun?: LiveRunState;
  finishReason?: unknown;
}

function isUndecided(entry: AgentActivityEntry): entry is AgentActivityToolEntry {
  return (
    entry.kind === 'tool' &&
    (entry.status === AWAITING_APPROVAL ||
      (entry.approval !== undefined && entry.approval.decision === undefined))
  );
}

function withLocalDecision(
  entry: AgentActivityEntry,
  toolCalls: readonly ToolCall[] | undefined,
): AgentActivityEntry {
  if (!isUndecided(entry) || entry.inputRequest) return entry;
  const local = toolCalls?.find((tool) => tool.toolCallId === entry.toolCallId)?.approvalDecision;
  if (!local) return entry;
  const approval = { ...(entry.approval ?? { id: entry.toolCallId }) };
  if (local === 'rejected') {
    return { ...entry, approval: { ...approval, decision: 'denied' }, status: FAILED };
  }
  return {
    ...entry,
    approval: { ...approval, decision: 'approved' },
    status: entry.status === AWAITING_APPROVAL ? CANCELLED : entry.status,
  };
}

function isDeclined(entry: AgentActivityEntry): boolean {
  return (
    entry.kind === 'tool' &&
    entry.status !== AWAITING_APPROVAL &&
    entry.approval?.decision === 'denied'
  );
}

function endedEmptyAfterDecline(entries: readonly AgentActivityEntry[]): boolean {
  const tools = entries.filter(
    (entry): entry is AgentActivityToolEntry => entry.kind === 'tool' && !entry.unavailable,
  );
  return (
    tools.some(isDeclined) &&
    tools.every((entry) => isDeclined(entry) || entry.status !== FAILED) &&
    entries.some((entry) => entry.kind === 'error' && entry.code === EMPTY_RESPONSE_FAILURE.code) &&
    entries.every((entry) => entry.kind !== 'error' || entry.code === EMPTY_RESPONSE_FAILURE.code)
  );
}

function onlyDeclinedSteps(entries: readonly AgentActivityEntry[]): boolean {
  return entries.every((entry) => entry.kind !== 'tool' || entry.unavailable || isDeclined(entry));
}

function pausedOnlyForDecidedRequests(
  activity: AgentActivityState,
  decidedLocally: boolean,
): boolean {
  return (
    decidedLocally &&
    activity.status === 'paused' &&
    activity.entries.every(
      (entry) =>
        entry.kind !== 'tool' || (entry.status !== 'awaiting-device' && !entry.inputRequest),
    )
  );
}

export function hasUndecidedApproval(activity: Pick<AgentActivityState, 'entries'>): boolean {
  return activity.entries.some(isUndecided);
}

export function isPlaceholderOnlyActivity(activity: Pick<AgentActivityState, 'entries'>): boolean {
  return activity.entries.every(
    (entry) => isLocalPlaceholderActivityEntry(entry) || isGenerationProgressEntry(entry),
  );
}

function settledByDecisions(
  activity: AgentActivityState,
  { toolCalls, streaming, hasText }: SettledTurnInput,
): AgentActivityState {
  if (streaming) return activity;
  const entries = activity.entries.map((entry) => withLocalDecision(entry, toolCalls));
  const decidedLocally = entries.some((entry, index) => entry !== activity.entries[index]);
  let settled = decidedLocally ? { ...activity, entries } : activity;
  if (hasUndecidedApproval(settled)) return activity;

  const decidedApproval = settled.entries.some(
    (entry) => entry.kind === 'tool' && entry.approval?.decision !== undefined,
  );
  if (!decidedApproval) return settled;

  if (!hasText && endedEmptyAfterDecline(settled.entries)) {
    settled = {
      ...settled,
      status: onlyDeclinedSteps(settled.entries) ? COMPLETED : PARTIAL,
      stopReason: 'end-turn',
      entries: settled.entries.filter((entry) => entry.kind !== 'error'),
    };
  }
  if (
    settled.status === AWAITING_APPROVAL ||
    settled.status === RUNNING ||
    pausedOnlyForDecidedRequests(settled, decidedLocally)
  ) {
    const unfinishedStep = settled.entries.some(
      (entry) => entry.kind === 'tool' && (entry.status === PENDING || entry.status === RUNNING),
    );
    settled = finishAgentActivityLocally(settled, {
      status: unfinishedStep ? PARTIAL : COMPLETED,
      completedAtMs: settled.updatedAtMs,
    });
  }
  return settled;
}

function isUnfinishedRun(activity: AgentActivityState): boolean {
  return activity.status === RUNNING && !hasUndecidedApproval(activity);
}

/**
 * The activity a turn is shown with. A stream that has ended can no longer be
 * holding a decision the person already made, so a request decided on the phone
 * reads as decided even when the server never echoed the decision, and a turn
 * the person declined that then ended with nothing to say ends as declined
 * rather than as waiting or failed. A run that is known not to be live any more
 * (behind a later turn, or the server has no run for it) reads as failed, or as
 * stopped when the answer was saved as stopped, so a reopened chat never shows a
 * turn as still working.
 */
export function settledTurnActivity(
  activity: AgentActivityState,
  input: SettledTurnInput,
): AgentActivityState {
  const settled = settledByDecisions(activity, input);
  if (input.streaming || input.liveRun !== 'ended' || !isUnfinishedRun(settled)) return settled;
  return finishAgentActivityLocally(settled, {
    status: isStoppedFinishReason(input.finishReason) ? CANCELLED : FAILED,
    completedAtMs: settled.updatedAtMs,
  });
}

export function hasUnfinishedRun(
  message: Pick<ChatMessage, 'role'> &
    Partial<Pick<ChatMessage, 'isStreaming' | 'metadata' | 'toolCalls' | 'content'>>,
): boolean {
  if (message.role !== 'assistant' || message.isStreaming === true) return false;
  const activity = readAgentActivityState(message.metadata?.['agentActivity']);
  if (!activity) return false;
  return isUnfinishedRun(
    settledByDecisions(activity, {
      toolCalls: message.toolCalls,
      streaming: false,
      hasText: /\S/.test(message.content ?? ''),
    }),
  );
}
