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
vi.mock('../../../lib/secret-handling-gate', () => ({
  applySecretHandlingToRequest: vi.fn(),
  buildSecretRedactionNotice: vi.fn(),
  applySecretHandlingToTexts: vi.fn(),
}));
vi.mock('@/lib/services/cloud-agent-run-service', () => ({
  APPROVAL_CHECKPOINT_TTL_HOURS: vi.fn(),
  ARCHIVABLE_TASK_STATES: vi.fn(),
  CLOUD_AGENT_RUN_CANCELLATION: vi.fn(),
  CloudAgentApprovalCheckpointConflictError: vi.fn(),
  CloudAgentApprovalCheckpointExpiredError: vi.fn(),
  CloudAgentApprovalCheckpointNotFoundError: vi.fn(),
  CloudAgentApprovalDecisionError: vi.fn(),
  CloudAgentDeviceMismatchError: vi.fn(),
  CloudAgentDeviceStepResultError: vi.fn(),
  CloudAgentInputResponseError: vi.fn(),
  CloudAgentRunNotArchivableError: vi.fn(),
  CloudAgentRunNotPausableError: vi.fn(),
  CloudAgentRunNotPausedError: vi.fn(),
  CloudAgentRunRestoreStateUnknownError: vi.fn(),
  CloudAgentRunSteerNotFoundError: vi.fn(),
  CloudAgentRunSteerStillReadableError: vi.fn(),
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
  withdrawCloudAgentRunSteer: vi.fn(),
  CloudAgentRunNotFoundError: class CloudAgentRunNotFoundError extends Error {},
  CloudAgentRunNotSteerableError: class CloudAgentRunNotSteerableError extends Error {},
  CloudAgentCodeRunNotSteerableError: class CloudAgentCodeRunNotSteerableError extends Error {},
  CloudAgentRunSteerQueueFullError: class CloudAgentRunSteerQueueFullError extends Error {},
  queueCloudAgentRunSteer: vi.fn(),
}));

import { MAX_CLOUD_AGENT_RUN_STEER_LENGTH } from '@agiworkforce/cloud-contracts';
import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  CloudAgentCodeRunNotSteerableError,
  CloudAgentRunNotFoundError,
  CloudAgentRunNotSteerableError,
  CloudAgentRunSteerQueueFullError,
  queueCloudAgentRunSteer,
} from '@/lib/services/cloud-agent-run-service';
import { applySecretHandlingToTexts } from '../../../lib/secret-handling-gate';
import { POST } from './route';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const ORGANIZATION_ID = '0190a000-0000-7000-8000-0000000000aa';
const db = { query: vi.fn() };
const context = { params: Promise.resolve({ runId: RUN_ID }) };

function steerRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/llm/v1/chat/completions/runs/${RUN_ID}/steer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/llm/v1/chat/completions/runs/[runId]/steer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserScopedDb).mockResolvedValue({
      db,
      userId: 'user-1',
      organizationId: ORGANIZATION_ID,
    } as never);
    vi.mocked(applySecretHandlingToTexts).mockImplementation(async (_userId, texts) => ({
      action: 'clean',
      texts: [...texts],
    }));
  });

  it('queues the message on the run in the active workspace', async () => {
    const steer = {
      id: '0190a000-0000-7000-8000-0000000000bb',
      text: 'Also cover the third quarter',
      queuedAt: '2026-09-28T10:00:00.000Z',
    };
    vi.mocked(queueCloudAgentRunSteer).mockResolvedValue({
      run: { id: RUN_ID, state: 'running', pendingSteers: [steer] },
      steer,
    } as never);

    const response = await POST(steerRequest({ message: 'Also cover the third quarter' }), context);

    expect(response.status).toBe(202);
    expect(queueCloudAgentRunSteer).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      text: 'Also cover the third quarter',
    });
    await expect(response.json()).resolves.toMatchObject({ steer: { id: steer.id } });
  });

  it('refuses an empty or oversized message before touching the run', async () => {
    for (const message of ['', 'x'.repeat(MAX_CLOUD_AGENT_RUN_STEER_LENGTH + 1)]) {
      const response = await POST(steerRequest({ message }), context);
      expect(response.status).toBe(400);
    }
    expect(queueCloudAgentRunSteer).not.toHaveBeenCalled();
  });

  it('blocks a message the secret gate refuses', async () => {
    vi.mocked(applySecretHandlingToTexts).mockResolvedValue({ action: 'blocked', texts: [] });

    const response = await POST(steerRequest({ message: 'here is my token' }), context);

    expect(response.status).toBe(400);
    expect(queueCloudAgentRunSteer).not.toHaveBeenCalled();
  });

  it('sends the redacted text when the gate redacts', async () => {
    vi.mocked(applySecretHandlingToTexts).mockResolvedValue({
      action: 'redacted',
      texts: ['here is my [redacted]'],
    });
    vi.mocked(queueCloudAgentRunSteer).mockResolvedValue({ run: {}, steer: {} } as never);

    await POST(steerRequest({ message: 'here is my token' }), context);

    expect(queueCloudAgentRunSteer).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ text: 'here is my [redacted]' }),
    );
  });

  it('points a Code task to its Code session', async () => {
    vi.mocked(queueCloudAgentRunSteer).mockRejectedValue(new CloudAgentCodeRunNotSteerableError());

    const response = await POST(steerRequest({ message: 'stop there' }), context);

    expect(response.status).toBe(409);
    await expect(response.text()).resolves.toContain('Code session');
  });

  it('refuses a run whose queue is full or that is no longer working', async () => {
    vi.mocked(queueCloudAgentRunSteer).mockRejectedValueOnce(
      new CloudAgentRunSteerQueueFullError(),
    );
    expect((await POST(steerRequest({ message: 'one more' }), context)).status).toBe(409);

    vi.mocked(queueCloudAgentRunSteer).mockRejectedValueOnce(
      new CloudAgentRunNotSteerableError('paused'),
    );
    expect((await POST(steerRequest({ message: 'one more' }), context)).status).toBe(409);
  });

  it('does not disclose a missing or cross-tenant run', async () => {
    vi.mocked(queueCloudAgentRunSteer).mockRejectedValue(new CloudAgentRunNotFoundError());

    const response = await POST(steerRequest({ message: 'hello' }), context);

    expect(response.status).toBe(404);
  });

  it('requires the CSRF token for a cookie session', async () => {
    vi.mocked(requireCsrfToken).mockResolvedValueOnce(new Response(null, { status: 403 }));

    const response = await POST(steerRequest({ message: 'hello' }), context);

    expect(response.status).toBe(403);
    expect(queueCloudAgentRunSteer).not.toHaveBeenCalled();
  });
});
