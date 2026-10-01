import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('next/server');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  class SlackRunApprovalError extends Error {
    constructor(
      message: string,
      readonly reason: string,
    ) {
      super(message);
    }
  }
  class SlackApprovalUnavailableError extends Error {}
  return {
    SlackRunApprovalError,
    SlackApprovalUnavailableError,
    getUserScopedDb: vi.fn(),
    requireCsrfToken: vi.fn(),
    withRateLimit: vi.fn(),
    recordAuditEvent: vi.fn(),
    claimSlackApproval: vi.fn(),
    after: vi.fn(),
    serviceDb: { query: vi.fn() },
    db: { query: vi.fn() },
  };
});

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  after: mocks.after,
}));
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
vi.mock('@/lib/server/neon-db', () => ({
  getStripeWebhookDb: vi.fn(),
  getNeonDb: vi.fn(() => mocks.serviceDb),
}));
vi.mock('@/lib/security-audit', () => ({
  BLOCK_APPEAL_PATH: '/support',
  SECURITY_EVENT_ACTIVITY_REDIS_KEY: 'agi-security-audit:pending-anomaly-check',
  auditEnvelopeFields: vi.fn(),
  auditRetentionClassFor: vi.fn(),
  consumePendingSecurityAnomalyCheck: vi.fn(),
  getClientIp: vi.fn(),
  logAuthFailure: vi.fn(),
  logAuthorizationFailure: vi.fn(),
  logCsrfFailure: vi.fn(),
  logInvalidSignature: vi.fn(),
  logRateLimitExceeded: vi.fn(),
  logSecurityEvent: vi.fn(),
  logSuspiciousActivity: vi.fn(),
  sanitizeAuditDetail: vi.fn(),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/slack/slack-assistant', () => ({
  handleSlackAssistantEvent: vi.fn(),
  SlackApprovalUnavailableError: mocks.SlackApprovalUnavailableError,
  claimSlackApproval: mocks.claimSlackApproval,
}));
vi.mock('@/lib/slack/slack-runs', () => ({
  SLACK_TASK_STOPPED_ERROR: 'task_stopped: the task was stopped in AGI Workforce',
  claimSlackRunApproval: vi.fn(),
  listPendingSlackApprovals: vi.fn(),
  parkSlackRunForApproval: vi.fn(),
  parkedSlackTasks: vi.fn(),
  settleSlackRun: vi.fn(),
  startSlackRun: vi.fn(),
  stopParkedSlackTasks: vi.fn(),
  SlackRunApprovalError: mocks.SlackRunApprovalError,
}));

import { createError } from '@/lib/errors';

import { POST } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const RUN = '55555555-5555-4555-8555-555555555555';
const approval = { decision: 'approved', toolCallIds: ['call-1', 'call-2'] };

function request(body: unknown = approval): NextRequest {
  return new NextRequest(`http://localhost/api/slack/runs/${RUN}/approval`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function context(runId = RUN) {
  return { params: Promise.resolve({ runId }) };
}

describe('POST /api/slack/runs/[runId]/approval', () => {
  const resume = vi.fn(async () => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({
      db: mocks.db,
      userId: 'user-1',
      organizationId: ORG,
    });
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.claimSlackApproval.mockResolvedValue(resume);
  });

  it('returns 401 without a session', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await POST(request(), context());
    expect(response.status).toBe(401);
    expect(mocks.claimSlackApproval).not.toHaveBeenCalled();
  });

  it('returns the CSRF refusal and decides nothing', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await POST(request(), context());
    expect(response.status).toBe(403);
    expect(mocks.claimSlackApproval).not.toHaveBeenCalled();
  });

  it('rejects a run id that is not a uuid', async () => {
    const response = await POST(request(), context('run-1'));
    expect(response.status).toBe(400);
    expect(mocks.claimSlackApproval).not.toHaveBeenCalled();
  });

  it('rejects a body without tool call ids', async () => {
    const response = await POST(request({ decision: 'approved', toolCallIds: [] }), context());
    expect(response.status).toBe(400);
    expect(mocks.claimSlackApproval).not.toHaveBeenCalled();
  });

  it('returns 404 when the run is not the caller', async () => {
    mocks.claimSlackApproval.mockRejectedValue(
      new mocks.SlackRunApprovalError('missing', 'not_found'),
    );
    const response = await POST(request(), context());
    expect(response.status).toBe(404);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('returns 409 when the approval is stale', async () => {
    mocks.claimSlackApproval.mockRejectedValue(new mocks.SlackRunApprovalError('stale', 'stale'));
    const response = await POST(request(), context());
    expect(response.status).toBe(409);
  });

  it('returns 409 when the approval cannot be resumed', async () => {
    mocks.claimSlackApproval.mockRejectedValue(new mocks.SlackApprovalUnavailableError('gone'));
    const response = await POST(request(), context());
    expect(response.status).toBe(409);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('claims the approval as the caller, audits it and resumes after the response', async () => {
    const response = await POST(request(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      runId: RUN,
      decision: 'approved',
      status: 'resuming',
    });
    expect(mocks.claimSlackApproval).toHaveBeenCalledWith({
      serviceDb: mocks.serviceDb,
      scopedDb: mocks.db,
      userId: 'user-1',
      runId: RUN,
      approval,
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'tool_approval_decided',
        organizationId: ORG,
        detail: expect.objectContaining({ resourceId: RUN, status: 'approved', count: 2 }),
      }),
    );
    expect(mocks.after).toHaveBeenCalledWith(resume);
  });
});
