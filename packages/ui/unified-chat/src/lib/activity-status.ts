import type {
  AgentActivityEntry,
  AgentActivityState,
  AgentActivityToolEntry,
} from '@agiworkforce/client-runtime';
import { isAgiWorkPlanOverviewEntry } from './agi-work-progress';
import {
  readConnectorConnectRequest,
  type ConnectorConnectRequest,
} from './connector-connect-required';
import {
  connectorStepSentence,
  type ConnectorStepPhase,
} from '../components/connector-step-sentence';
import {
  CONNECTOR_AUTHORIZATION_REASONS,
  classifyToolFailure,
  toolFailureReason,
} from './tool-failure';

/**
 * The run is holding a decision the user has not made yet.
 *
 * Read from the entries rather than from `activity.status`, because the run
 * status does not survive the race: `approval-requested` sets
 * `awaiting-approval` and a later `task-state-changed` with `paused` overwrites
 * it, so a turn genuinely waiting on a decision was observed reporting
 * `paused`. The tool entry keeps its unresolved `approval` through both, so
 * that is what the question is asked of.
 */
export function hasOpenApprovalDecision(
  activity: Pick<AgentActivityState, 'entries'> | undefined,
): boolean {
  return (
    activity?.entries.some(
      (entry) =>
        entry.kind === 'tool' &&
        entry.approval !== undefined &&
        entry.approval.decision === undefined,
    ) ?? false
  );
}

function lastStepFailed(activity: Pick<AgentActivityState, 'entries'>): boolean {
  for (let index = activity.entries.length - 1; index >= 0; index -= 1) {
    const entry = activity.entries[index];
    if (!entry) continue;
    if (entry.kind === 'error') return true;
    if (entry.kind !== 'tool' && entry.kind !== 'progress') continue;
    if (isAgiWorkPlanOverviewEntry(entry)) continue;
    if (entry.status === 'pending' || entry.status === 'running') continue;
    return entry.status === 'failed';
  }
  return false;
}

// An undecided approval reads as awaiting one whatever task-state-changed wrote later; a partial run whose last step succeeded reads as completed.
export function settledActivityStatus(
  activity: Pick<AgentActivityState, 'entries' | 'status'>,
): AgentActivityState['status'] {
  if (hasOpenApprovalDecision(activity)) return 'awaiting-approval';
  if (activity.status === 'partial' && !lastStepFailed(activity)) return 'completed';
  return activity.status;
}

export function isConnectorStep(entry: AgentActivityEntry): entry is AgentActivityToolEntry {
  return entry.kind === 'tool' && (entry.category === 'connector' || entry.category === 'mcp');
}

export function connectorStepPhase(entry: AgentActivityToolEntry): ConnectorStepPhase {
  switch (entry.status) {
    case 'completed':
      return 'finished';
    case 'cancelled':
      return 'stopped';
    case 'awaiting-approval':
      return 'waiting';
    case 'failed':
      return entry.approval?.decision === 'denied' ? 'declined' : 'failed';
    case 'pending':
    case 'running':
    case 'awaiting-device':
      return 'running';
  }
}

export function connectRequestFor(entry: AgentActivityToolEntry): ConnectorConnectRequest | null {
  return readConnectorConnectRequest({
    qualifiedToolName: entry.name,
    result: typeof entry.output === 'string' ? entry.output : undefined,
    isError: entry.status === 'failed',
  });
}

export function connectorSentence(entry: AgentActivityEntry): string | undefined {
  if (!isConnectorStep(entry) || entry.unavailable) return undefined;
  const verifiedConnectorName = connectRequestFor(entry)?.connectorName;
  return connectorStepSentence({
    name: entry.name,
    summary: entry.summary,
    phase: connectorStepPhase(entry),
    ...(verifiedConnectorName ? { verifiedConnectorName } : {}),
  });
}

export function connectorFailureReason(
  entry: AgentActivityToolEntry,
  connectRequest: ConnectorConnectRequest | null,
): string | undefined {
  if (!isConnectorStep(entry) || connectorStepPhase(entry) !== 'failed') return undefined;
  if (connectRequest) return CONNECTOR_AUTHORIZATION_REASONS[connectRequest.reason];
  return toolFailureReason(classifyToolFailure(entry.error));
}
