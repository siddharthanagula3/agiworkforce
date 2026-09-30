import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: vi.fn(),
  acquireManagedTurnSlot: vi.fn(),
  checkRateLimit: vi.fn(),
  clientIpRateLimitIdentifier: vi.fn(),
  getClientIpForRateLimit: vi.fn(),
  isSharedStoreQuotaExhausted: vi.fn(),
  rateLimitConfigs: vi.fn(),
  readManagedTurnSlots: vi.fn(),
  resolveRedisOutagePolicy: vi.fn(),
  resolveTierRateLimit: vi.fn(),
  withRateLimitHandler: vi.fn(),
  withRateLimit: vi.fn(() => null),
}));
vi.mock('@/lib/csrf', () => ({
  generateCsrfToken: vi.fn(),
  getOrCreateAnonSession: vi.fn(),
  getSessionIdFromRequest: vi.fn(),
  isBearerTokenValid: vi.fn(),
  readCookie: vi.fn(),
  resetCsrfCache: vi.fn(),
  validateCsrfFromRequest: vi.fn(),
  verifyCsrfToken: vi.fn(),
  requireCsrfToken: vi.fn(() => null),
}));
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: vi.fn(),
}));
vi.mock('@/lib/services/cloud-agent-run-service', () => ({
  APPROVAL_CHECKPOINT_TTL_HOURS: vi.fn(),
  ARCHIVABLE_TASK_STATES: vi.fn(),
  CLOUD_AGENT_RUN_CANCELLATION: vi.fn(),
  CloudAgentApprovalCheckpointConflictError: vi.fn(),
  CloudAgentApprovalCheckpointExpiredError: vi.fn(),
  CloudAgentApprovalCheckpointNotFoundError: vi.fn(),
  CloudAgentApprovalDecisionError: vi.fn(),
  CloudAgentCodeRunNotSteerableError: vi.fn(),
  CloudAgentDeviceMismatchError: vi.fn(),
  CloudAgentDeviceStepResultError: vi.fn(),
  CloudAgentInputResponseError: vi.fn(),
  CloudAgentRunNotArchivableError: vi.fn(),
  CloudAgentRunNotPausableError: vi.fn(),
  CloudAgentRunNotPausedError: vi.fn(),
  CloudAgentRunNotSteerableError: vi.fn(),
  CloudAgentRunRestoreStateUnknownError: vi.fn(),
  CloudAgentRunSteerQueueFullError: vi.fn(),
  DEVICE_CHECKPOINT_TTL_MINUTES: vi.fn(),
  EXECUTOR_HELD_TASK_STATES: vi.fn(),
  HUMAN_HELD_TASK_STATES: vi.fn(),
  appendCloudAgentEvent: vi.fn(),
  appendCloudAgentEvents: vi.fn(),
  archiveCloudAgentRun: vi.fn(),
  cancelHumanHeldCloudAgentRun: vi.fn(),
  claimCloudAgentApprovalCheckpoint: vi.fn(),
  claimCloudAgentDeviceCheckpoint: vi.fn(),
  claimCloudAgentInputCheckpoint: vi.fn(),
  claimCloudAgentPauseCheckpoint: vi.fn(),
  completeCloudAgentApprovalCheckpoint: vi.fn(),
  completeCloudAgentDeviceCheckpoint: vi.fn(),
  completeCloudAgentInputCheckpoint: vi.fn(),
  createCloudAgentRun: vi.fn(),
  findActiveCloudAgentRunForConversation: vi.fn(),
  getCloudAgentRun: vi.fn(),
  isCloudAgentRunCancellationRequested: vi.fn(),
  isCloudAgentRunHumanHeld: vi.fn(),
  isCloudAgentRunPauseRequested: vi.fn(),
  isCloudAgentRunTerminal: vi.fn(),
  listCloudAgentRuns: vi.fn(),
  queueCloudAgentRunSteer: vi.fn(),
  readCloudAgentRunAssistantText: vi.fn(),
  recordCloudAgentRunSettledUsage: vi.fn(),
  releaseCloudAgentApprovalCheckpoint: vi.fn(),
  releaseCloudAgentDeviceCheckpoint: vi.fn(),
  releaseCloudAgentInputCheckpoint: vi.fn(),
  releaseCloudAgentPauseCheckpoint: vi.fn(),
  requestCloudAgentRunCancellation: vi.fn(),
  requestCloudAgentRunPause: vi.fn(),
  saveCloudAgentApprovalCheckpoint: vi.fn(),
  saveCloudAgentDeviceCheckpoint: vi.fn(),
  saveCloudAgentInputCheckpoint: vi.fn(),
  saveCloudAgentPauseCheckpoint: vi.fn(),
  takeCloudAgentRunSteers: vi.fn(),
  transitionCloudAgentRun: vi.fn(),
  unarchiveCloudAgentRun: vi.fn(),
  withdrawCloudAgentRunPauseRequest: vi.fn(),
  CloudAgentRunNotFoundError: class CloudAgentRunNotFoundError extends Error {},
  CloudAgentRunSteerNotFoundError: class CloudAgentRunSteerNotFoundError extends Error {},
  CloudAgentRunSteerStillReadableError: class CloudAgentRunSteerStillReadableError extends Error {},
  withdrawCloudAgentRunSteer: vi.fn(),
}));

import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  CloudAgentRunNotFoundError,
  CloudAgentRunSteerNotFoundError,
  CloudAgentRunSteerStillReadableError,
  withdrawCloudAgentRunSteer,
} from '@/lib/services/cloud-agent-run-service';
import { DELETE } from './route';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const STEER_ID = '0190a000-0000-7000-8000-0000000000bb';
const ORGANIZATION_ID = '0190a000-0000-7000-8000-0000000000aa';
const db = { query: vi.fn() };

function withdrawRequest(): NextRequest {
  return new NextRequest(
    `http://localhost/api/llm/v1/chat/completions/runs/${RUN_ID}/steer/${STEER_ID}`,
    { method: 'DELETE' },
  );
}

function context(runId = RUN_ID, steerId = STEER_ID) {
  return { params: Promise.resolve({ runId, steerId }) };
}

describe('DELETE /api/llm/v1/chat/completions/runs/[runId]/steer/[steerId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserScopedDb).mockResolvedValue({
      db,
      userId: 'user-1',
      organizationId: ORGANIZATION_ID,
    } as never);
  });

  it('withdraws an unread message from a finished run in the active workspace', async () => {
    vi.mocked(withdrawCloudAgentRunSteer).mockResolvedValue({
      id: RUN_ID,
      state: 'ready_for_review',
    } as never);

    const response = await DELETE(withdrawRequest(), context());

    expect(response.status).toBe(200);
    expect(withdrawCloudAgentRunSteer).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      steerId: STEER_ID,
    });
    await expect(response.json()).resolves.toMatchObject({ run: { id: RUN_ID } });
  });

  it('leaves a message the task can still read where it is', async () => {
    vi.mocked(withdrawCloudAgentRunSteer).mockRejectedValue(
      new CloudAgentRunSteerStillReadableError(),
    );

    const response = await DELETE(withdrawRequest(), context());

    expect(response.status).toBe(409);
  });

  it('does not disclose a missing run, a missing message or a malformed id', async () => {
    vi.mocked(withdrawCloudAgentRunSteer).mockRejectedValueOnce(new CloudAgentRunNotFoundError());
    expect((await DELETE(withdrawRequest(), context())).status).toBe(404);

    vi.mocked(withdrawCloudAgentRunSteer).mockRejectedValueOnce(
      new CloudAgentRunSteerNotFoundError(),
    );
    expect((await DELETE(withdrawRequest(), context())).status).toBe(404);

    expect((await DELETE(withdrawRequest(), context(RUN_ID, 'not-an-id'))).status).toBe(404);
  });

  it('requires the CSRF token for a cookie session', async () => {
    vi.mocked(requireCsrfToken).mockResolvedValueOnce(new Response(null, { status: 403 }));

    const response = await DELETE(withdrawRequest(), context());

    expect(response.status).toBe(403);
    expect(withdrawCloudAgentRunSteer).not.toHaveBeenCalled();
  });
});
