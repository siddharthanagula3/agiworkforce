import type {
  AgentActivityEntry,
  AgentActivityState,
  AgentActivityToolEntry,
} from '@agiworkforce/client-runtime';
import {
  WEB_SEARCH_NOT_PERFORMED_CODE,
  isDeclinedWebSearchError,
} from '@agiworkforce/cloud-contracts';
import { getToolDisplayLabel, isTerminalToolStatus } from '@agiworkforce/types';
import { translatePlural } from '@/src/i18n/plural';
import type { ToolCall } from '@/types/chat';

export const DECLINED_STEP_LABEL = 'Declined';

function decisionFor(
  entry: AgentActivityToolEntry,
  toolCalls: readonly ToolCall[] | undefined,
): 'approved' | 'rejected' | undefined {
  const local = toolCalls?.find((tool) => tool.toolCallId === entry.toolCallId)?.approvalDecision;
  if (local) return local;
  const decision = entry.approval?.decision;
  if (decision === 'denied') return 'rejected';
  if (decision === 'approved' || decision === 'approved-for-session') return 'approved';
  return undefined;
}

export function isDeclinedToolStep(
  entry: AgentActivityToolEntry,
  toolCalls?: readonly ToolCall[],
): boolean {
  return entry.status !== 'awaiting-approval' && decisionFor(entry, toolCalls) === 'rejected';
}

export function isDeclinedToolCall(tool: ToolCall): boolean {
  return tool.approvalDecision === 'rejected' && isTerminalToolStatus(tool.status);
}

export function declinedToolLabel(name: string): string {
  return getToolDisplayLabel(name).displayName;
}

function declinedSteps(
  activity: Pick<AgentActivityState, 'entries'>,
  toolCalls: readonly ToolCall[] | undefined,
): AgentActivityToolEntry[] {
  return activity.entries.filter(
    (entry): entry is AgentActivityToolEntry =>
      entry.kind === 'tool' && isDeclinedToolStep(entry, toolCalls),
  );
}

export function isDeclineCausedError(
  entry: AgentActivityEntry,
  activity: Pick<AgentActivityState, 'entries'>,
  toolCalls?: readonly ToolCall[],
): boolean {
  if (entry.kind !== 'error') return false;
  if (isDeclinedWebSearchError(entry)) return true;
  if (entry.code !== WEB_SEARCH_NOT_PERFORMED_CODE) return false;
  return activity.entries.some(
    (step) =>
      step.kind === 'tool' && step.category === 'web-search' && isDeclinedToolStep(step, toolCalls),
  );
}

export function withoutDeclineCausedErrors<T extends Pick<AgentActivityState, 'entries'>>(
  activity: T,
  toolCalls?: readonly ToolCall[],
): AgentActivityEntry[] {
  return activity.entries.filter((entry) => !isDeclineCausedError(entry, activity, toolCalls));
}

export function activityEndedByDecline(
  activity: Pick<AgentActivityState, 'entries' | 'status'>,
  toolCalls?: readonly ToolCall[],
): boolean {
  const { status } = activity;
  if (status !== 'failed' && status !== 'partial' && status !== 'completed') return false;
  if (
    activity.entries.some(
      (entry) => entry.kind === 'error' && !isDeclineCausedError(entry, activity, toolCalls),
    )
  ) {
    return false;
  }
  const declined = declinedSteps(activity, toolCalls);
  if (declined.length === 0) return false;
  return activity.entries.every(
    (entry) =>
      entry.kind !== 'tool' ||
      entry.unavailable === true ||
      isDeclinedToolStep(entry, toolCalls) ||
      (status !== 'completed' && entry.status !== 'failed'),
  );
}

export function toolCallsEndedByDecline(toolCalls: readonly ToolCall[]): boolean {
  return (
    toolCalls.some(isDeclinedToolCall) &&
    toolCalls.every((tool) => tool.status !== 'failed' || isDeclinedToolCall(tool))
  );
}

function declinedSentence(names: readonly string[]): string {
  const only = names.length === 1 ? names[0] : undefined;
  if (only !== undefined) return `You declined ${declinedToolLabel(only)}`;
  return translatePlural('chat', 'counts.declinedActions', names.length, {
    one: 'You declined {{count}} action',
    other: 'You declined {{count}} actions',
  });
}

export function declinedToolCallsSummary(toolCalls: readonly ToolCall[]): string {
  return declinedSentence(toolCalls.filter(isDeclinedToolCall).map((tool) => tool.name));
}

export function declinedActivitySummary(
  activity: Pick<AgentActivityState, 'entries'>,
  toolCalls?: readonly ToolCall[],
): string {
  return declinedSentence(declinedSteps(activity, toolCalls).map((entry) => entry.name));
}
