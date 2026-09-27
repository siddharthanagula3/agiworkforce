import * as Crypto from 'expo-crypto';
import { CloudCodeApiError, createManagedCloudCodeApi } from '@agiworkforce/cloud-contracts';
import { CLOUD_CODE_AGENT_TURN_REQUEST_LIMIT_MS } from '@agiworkforce/types';
import { TIMEOUTS } from '@/lib/constants';
import { apiFetch } from '@/services/api';
import { httpErrorFrom } from '@/services/apiErrors';

export const CLOUD_CODE_LIST_ERROR = 'Cloud sessions could not be loaded';
export const CLOUD_CODE_OPEN_ERROR = 'This session could not be opened';
export const CLOUD_CODE_SEND_ERROR = 'Your message could not be sent';
export const CLOUD_CODE_STOP_ERROR = 'The task could not be stopped';
export const CLOUD_CODE_DECISION_ERROR = 'Your decision could not be sent';
export const CLOUD_CODE_UNARCHIVE_ERROR = 'This session could not be unarchived';

const MISSING_SESSION_STATUSES = new Set([400, 403, 404]);

export const cloudCodeApi = createManagedCloudCodeApi({
  fetchImpl: (path, init, { runsAgentTurn }) =>
    apiFetch(
      path,
      init,
      runsAgentTurn ? { timeout: CLOUD_CODE_AGENT_TURN_REQUEST_LIMIT_MS + TIMEOUTS.DEFAULT } : {},
    ),
});

export function newCloudCodeIdempotencyKey(): string {
  return Crypto.randomUUID();
}

export function isMissingCloudCodeSession(error: unknown): boolean {
  return error instanceof CloudCodeApiError && MISSING_SESSION_STATUSES.has(error.status);
}

export function describeCloudCodeError(error: unknown, fallback: string): string {
  if (error instanceof CloudCodeApiError && error.status === 429) {
    return httpErrorFrom(error.status, '').message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
