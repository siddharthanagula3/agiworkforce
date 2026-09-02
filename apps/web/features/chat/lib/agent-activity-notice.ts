import type { AgentEventEnvelope } from '@agiworkforce/types';
import type { AgentActivityState } from '@agiworkforce/client-runtime';
import { toUserMessage } from '@/lib/user-error-message';

const WORKFLOW_STEP_FAILURE_PATTERN =
  /^(?:Fatal|Retryable)?Error:\s*Step\s+"[^"]*"\s+failed after \d+ retr(?:y|ies):\s*([\s\S]+)$/i;

const AGENT_ERROR_FALLBACK_MESSAGE =
  'The response failed. Try again, or start a new chat if this keeps happening.';

export function humanizeAgentErrorMessage(rawMessage: string): string {
  const trimmed = rawMessage.trim();
  const stepFailure = WORKFLOW_STEP_FAILURE_PATTERN.exec(trimmed)?.[1]?.trim();
  return toUserMessage(new Error(stepFailure || trimmed), AGENT_ERROR_FALLBACK_MESSAGE);
}

export function humanizeAgentEventEnvelope(envelope: AgentEventEnvelope): AgentEventEnvelope {
  if (envelope.event.type !== 'error') return envelope;
  return {
    ...envelope,
    event: { ...envelope.event, message: humanizeAgentErrorMessage(envelope.event.message) },
  };
}

export function isTerminalAgentEventEnvelope(envelope: AgentEventEnvelope): boolean {
  return (
    envelope.event.type === 'error' ||
    (envelope.event.type === 'stop' && envelope.event.reason === 'error')
  );
}

export function collapseDuplicateAgentActivityErrors(
  activity: AgentActivityState,
): AgentActivityState {
  const errorEntryIndexes = activity.entries.reduce<number[]>((indexes, entry, index) => {
    if (entry.kind === 'error') indexes.push(index);
    return indexes;
  }, []);
  if (errorEntryIndexes.length <= 1) return activity;
  const keepIndex = errorEntryIndexes[errorEntryIndexes.length - 1];
  return {
    ...activity,
    entries: activity.entries.filter(
      (entry, index) => entry.kind !== 'error' || index === keepIndex,
    ),
  };
}
