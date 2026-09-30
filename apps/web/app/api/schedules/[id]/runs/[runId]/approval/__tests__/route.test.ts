import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  class ScheduleValidationError extends Error {}
  class ScheduleNotFoundError extends Error {}
  class ScheduleConflictError extends Error {}
  return {
    ScheduleValidationError,
    ScheduleNotFoundError,
    ScheduleConflictError,
    withRateLimit: vi.fn(),
    requireCsrfToken: vi.fn(),
    getUserScopedDb: vi.fn(),
    claimScheduleRunApproval: vi.fn(),
    processClaimedScheduleRun: vi.fn(),
    executeScheduledAgent: vi.fn(),
  };
});

vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
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
  withRateLimit: mocks.withRateLimit,
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
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/services/schedule-service', () => ({
  ScheduleLimitError: class ScheduleLimitError extends Error {},
  UNATTENDED_RUN_DENIED_STATUSES: vi.fn(),
  assertProjectOwnership: vi.fn(),
  assertScheduleQuota: vi.fn(),
  claimDueScheduleRuns: vi.fn(),
  countSchedules: vi.fn(),
  createEventTriggeredScheduleRun: vi.fn(),
  createManualScheduleRun: vi.fn(),
  createSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  detectMissedExecution: vi.fn(),
  finalizeScheduleRun: vi.fn(),
  getSchedule: vi.fn(),
  listRecentScheduleRuns: vi.fn(),
  listScheduleRuns: vi.fn(),
  listSchedules: vi.fn(),
  mapScheduleRun: vi.fn(),
  mapScheduleTask: vi.fn(),
  processDueScheduleRuns: vi.fn(),
  retryDelaySeconds: vi.fn(),
  setScheduleEnabled: vi.fn(),
  updateSchedule: vi.fn(),
  ScheduleValidationError: mocks.ScheduleValidationError,
  ScheduleNotFoundError: mocks.ScheduleNotFoundError,
  ScheduleConflictError: mocks.ScheduleConflictError,
  claimScheduleRunApproval: mocks.claimScheduleRunApproval,
  processClaimedScheduleRun: mocks.processClaimedScheduleRun,
}));
vi.mock('@/lib/services/scheduled-agent-executor', () => ({
  MAX_OUTPUT_TOKENS: 4_096,
  ScheduledProjectContextUnavailableError: class ScheduledProjectContextUnavailableError extends Error {},
  approvalToolCalls: vi.fn(),
  buildScheduledToolPlan: vi.fn(),
  runScheduledCompletion: vi.fn(),
  runScheduledToolLoop: vi.fn(),
  withheldToolsDirective: vi.fn(),
  executeScheduledAgent: mocks.executeScheduledAgent,
}));

import { POST } from '../route';

const db = { query: vi.fn() };
const approval = { decision: 'approved', toolCallIds: ['call-1'] };

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/schedules/task-1/runs/run-1/approval', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'task-1', runId: 'run-1' }) },
  );
}

describe('POST /api/schedules/[id]/runs/[runId]/approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
  });

  it('returns 401 when the caller is not signed in', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await post(approval);

    expect(response.status).toBe(401);
    expect(mocks.claimScheduleRunApproval).not.toHaveBeenCalled();
  });

  it('rate limits per user', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await post(approval);

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'llm-completion',
      'user:user-1',
    );
  });

  it('returns the csrf refusal bound to the caller', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await post(approval);

    expect(response.status).toBe(403);
    expect(mocks.requireCsrfToken).toHaveBeenCalledWith(expect.anything(), 'user-1');
    expect(mocks.claimScheduleRunApproval).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed json', '{'],
    ['an unknown decision', { decision: 'maybe', toolCallIds: ['call-1'] }],
    ['no tool calls', { decision: 'approved', toolCallIds: [] }],
  ])('rejects %s with 400', async (_label, body) => {
    const response = await post(body);

    expect(response.status).toBe(400);
    expect(mocks.claimScheduleRunApproval).not.toHaveBeenCalled();
  });

  it.each([
    ['ScheduleValidationError', 400],
    ['ScheduleNotFoundError', 404],
    ['ScheduleConflictError', 409],
  ] as const)('maps %s to %s', async (name, status) => {
    mocks.claimScheduleRunApproval.mockRejectedValue(new mocks[name]('nope'));

    const response = await post(approval);

    expect(response.status).toBe(status);
    expect(mocks.processClaimedScheduleRun).not.toHaveBeenCalled();
  });

  it('claims the approval for the caller and resumes the run', async () => {
    const claim = { runId: 'run-1' };
    const resume = { checkpoint: 'cp-1' };
    const run = { id: 'run-1', status: 'succeeded' };
    mocks.claimScheduleRunApproval.mockResolvedValue({ claim, resume });
    mocks.processClaimedScheduleRun.mockResolvedValue(run);

    const response = await post(approval);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ run });
    expect(mocks.claimScheduleRunApproval).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      taskId: 'task-1',
      runId: 'run-1',
      approval,
      leaseSeconds: 45,
    });
    expect(mocks.processClaimedScheduleRun).toHaveBeenCalledWith(
      db,
      claim,
      mocks.executeScheduledAgent,
      { timeoutMs: 40_000, resume },
    );
  });
});
