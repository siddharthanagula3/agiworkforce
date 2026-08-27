import {
  ManagedCloudAgentRunAlreadyResumingError,
  ManagedCloudAgentRunApprovalExpiredError,
  type CloudAgentRun,
  type CloudAgentRunListPage,
  type ManagedCloudAgentRunApprovalDecision,
  type ManagedCloudAgentRunFollowOptions,
  type ManagedCloudAgentRunFollowResult,
} from '@agiworkforce/cloud-contracts';
import type { AgentTaskState } from '@agiworkforce/types/protocol';
import { createMobileCloudAgentRunClient } from '@/services/streaming';

export const CLOUD_RUN_PAGE_LIMIT = 25;

export const CLOUD_RUN_LIST_ERROR = 'Cloud tasks could not be loaded';
export const CLOUD_RUN_FOLLOW_ERROR = 'This task could not be opened';
export const CLOUD_RUN_DECISION_ERROR = 'Your decision could not be sent';
export const CLOUD_RUN_CANCEL_ERROR = 'This task could not be stopped';

const ALREADY_RESUMING_MESSAGE = 'Another device already answered this one';
const APPROVAL_EXPIRED_MESSAGE = 'This approval expired, so the task cannot continue from it';

export interface CloudRunListOptions {
  states: AgentTaskState[];
  cursor?: string;
  signal?: AbortSignal;
}

export function listCloudRuns(options: CloudRunListOptions): Promise<CloudAgentRunListPage> {
  return createMobileCloudAgentRunClient().listRuns({
    states: options.states,
    limit: CLOUD_RUN_PAGE_LIMIT,
    ...(options.cursor ? { cursor: options.cursor } : {}),
    signal: options.signal,
  });
}

export function followCloudRun(
  runId: string,
  options: ManagedCloudAgentRunFollowOptions,
): Promise<ManagedCloudAgentRunFollowResult> {
  return createMobileCloudAgentRunClient().followRun(runId, options);
}

export function resolveCloudRunApproval(
  runId: string,
  toolCallIds: string[],
  decision: ManagedCloudAgentRunApprovalDecision,
  signal?: AbortSignal,
): Promise<void> {
  return createMobileCloudAgentRunClient().resumeRun(
    runId,
    toolCallIds.map((toolCallId) => ({ toolCallId, decision })),
    { signal },
  );
}

export function cancelCloudRun(runId: string, signal?: AbortSignal): Promise<CloudAgentRun> {
  return createMobileCloudAgentRunClient().cancelRun(runId, { signal });
}

export function describeCloudRunError(error: unknown, fallback: string): string {
  if (error instanceof ManagedCloudAgentRunAlreadyResumingError) return ALREADY_RESUMING_MESSAGE;
  if (error instanceof ManagedCloudAgentRunApprovalExpiredError) return APPROVAL_EXPIRED_MESSAGE;
  return error instanceof Error && error.message ? error.message : fallback;
}

export function isAbortedCloudRunError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
