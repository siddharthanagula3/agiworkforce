import {
  ManagedCloudAgentRunHttpError,
  type CloudAgentRun,
  type CloudAgentRunSteerResponse,
} from '@agiworkforce/cloud-contracts';
import { createMobileCloudAgentRunClient } from '@/services/streaming';

const CLOUD_RUN_STEER_ERROR = 'Your message was not sent. The task keeps working without it.';
const REFUSAL_STATUSES = new Set([400, 409]);

export function steerCloudRun(
  runId: string,
  message: string,
  signal?: AbortSignal,
): Promise<CloudAgentRunSteerResponse> {
  return createMobileCloudAgentRunClient().steerRun(runId, message, { signal });
}

export function withdrawCloudRunSteer(runId: string, steerId: string): Promise<CloudAgentRun> {
  return createMobileCloudAgentRunClient().withdrawSteer(runId, steerId);
}

export function describeCloudRunSteerError(error: unknown): string {
  return error instanceof ManagedCloudAgentRunHttpError &&
    REFUSAL_STATUSES.has(error.status) &&
    error.message
    ? error.message
    : CLOUD_RUN_STEER_ERROR;
}
