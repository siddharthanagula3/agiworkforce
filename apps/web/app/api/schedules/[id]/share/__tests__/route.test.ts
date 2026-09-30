import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  class ScheduleNotFoundError extends Error {}
  return {
    ScheduleNotFoundError,
    withRateLimit: vi.fn(),
    requireCsrfToken: vi.fn(),
    getUserScopedDb: vi.fn(),
    getSchedule: vi.fn(),
    inspectOutboundContent: vi.fn(),
    resolveSecretHandlingPolicy: vi.fn(),
    saveScheduleShare: vi.fn(),
    scheduleShareSnapshot: vi.fn(),
    unshareSchedule: vi.fn(),
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
vi.mock('@/lib/security/outbound-content-inspection', () => ({
  OUTBOUND_BLOCKED_MESSAGE:
    'This was not sent because it appears to contain sensitive data, such as an API key or access token. Remove it and try again.',
  registerOutboundContentScanner: vi.fn(),
  secretPatternScanner: vi.fn(),
  inspectOutboundContent: mocks.inspectOutboundContent,
}));
vi.mock('@/lib/services/organization-policy-gate', () => ({
  diagnoseMemberPolicy: vi.fn(),
  evaluateActiveWorkspacePolicy: vi.fn(),
  readOrganizationIpAllowList: vi.fn(),
  resolveEffectiveWorkspaceControls: vi.fn(),
  resolveIpAllowListPolicy: vi.fn(),
  resolveMfaPolicy: vi.fn(),
  resolveZeroDataRetentionPolicy: vi.fn(),
  resolveSecretHandlingPolicy: mocks.resolveSecretHandlingPolicy,
}));
vi.mock('@/lib/services/schedule-service', () => ({
  ScheduleConflictError: class ScheduleConflictError extends Error {},
  ScheduleLimitError: class ScheduleLimitError extends Error {},
  ScheduleValidationError: class ScheduleValidationError extends Error {},
  UNATTENDED_RUN_DENIED_STATUSES: vi.fn(),
  assertProjectOwnership: vi.fn(),
  assertScheduleQuota: vi.fn(),
  claimDueScheduleRuns: vi.fn(),
  claimScheduleRunApproval: vi.fn(),
  countSchedules: vi.fn(),
  createEventTriggeredScheduleRun: vi.fn(),
  createManualScheduleRun: vi.fn(),
  createSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  detectMissedExecution: vi.fn(),
  finalizeScheduleRun: vi.fn(),
  listRecentScheduleRuns: vi.fn(),
  listScheduleRuns: vi.fn(),
  listSchedules: vi.fn(),
  mapScheduleRun: vi.fn(),
  mapScheduleTask: vi.fn(),
  processClaimedScheduleRun: vi.fn(),
  processDueScheduleRuns: vi.fn(),
  retryDelaySeconds: vi.fn(),
  setScheduleEnabled: vi.fn(),
  updateSchedule: vi.fn(),
  getSchedule: mocks.getSchedule,
  ScheduleNotFoundError: mocks.ScheduleNotFoundError,
}));
vi.mock('@/lib/services/schedule-share-service', () => ({
  getSharedSchedule: vi.fn(),
  saveScheduleShare: mocks.saveScheduleShare,
  scheduleShareSnapshot: mocks.scheduleShareSnapshot,
  unshareSchedule: mocks.unshareSchedule,
}));

import { DELETE, POST } from '../route';

const db = { query: vi.fn() };
const task = { id: 'task-1', name: 'Weekly digest' };
const snapshot = { name: 'Weekly digest', prompt: 'Summarize' };

function call(method: 'POST' | 'DELETE') {
  const request = new NextRequest('http://localhost/api/schedules/task-1/share', { method });
  const context = { params: Promise.resolve({ id: 'task-1' }) };
  return method === 'POST' ? POST(request, context) : DELETE(request, context);
}

describe('/api/schedules/[id]/share', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
    mocks.getSchedule.mockResolvedValue(task);
    mocks.scheduleShareSnapshot.mockReturnValue(snapshot);
  });

  it.each(['POST', 'DELETE'] as const)('%s returns 401 when signed out', async (method) => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await call(method);

    expect(response.status).toBe(401);
    expect(mocks.saveScheduleShare).not.toHaveBeenCalled();
    expect(mocks.unshareSchedule).not.toHaveBeenCalled();
  });

  it.each(['POST', 'DELETE'] as const)('%s returns the csrf refusal', async (method) => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await call(method);

    expect(response.status).toBe(403);
    expect(mocks.requireCsrfToken).toHaveBeenCalledWith(expect.anything(), 'user-1');
    expect(mocks.saveScheduleShare).not.toHaveBeenCalled();
    expect(mocks.unshareSchedule).not.toHaveBeenCalled();
  });

  it('POST returns 404 for a schedule the caller does not own', async () => {
    mocks.getSchedule.mockRejectedValue(new mocks.ScheduleNotFoundError('missing'));

    const response = await call('POST');

    expect(response.status).toBe(404);
    expect(mocks.inspectOutboundContent).not.toHaveBeenCalled();
  });

  it('POST refuses to share a schedule the secret policy blocks', async () => {
    mocks.inspectOutboundContent.mockResolvedValue({
      action: 'blocked',
      message: 'This schedule contains a secret.',
    });

    const response = await call('POST');

    expect(response.status).toBe(400);
    expect(mocks.saveScheduleShare).not.toHaveBeenCalled();
  });

  it('POST shares the inspected snapshot for the caller', async () => {
    const redacted = { ...snapshot, prompt: '[redacted]' };
    const share = { token: 'tok-1', url: 'https://x/s/tok-1' };
    mocks.inspectOutboundContent.mockImplementation(async (input) => {
      await input.resolveMode();
      return { action: 'allowed', value: redacted };
    });
    mocks.saveScheduleShare.mockResolvedValue(share);

    const response = await call('POST');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ share });
    expect(mocks.getSchedule).toHaveBeenCalledWith(db, 'user-1', 'task-1');
    expect(mocks.inspectOutboundContent).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'share',
        value: snapshot,
        userId: 'user-1',
        resourceId: 'task-1',
      }),
    );
    expect(mocks.resolveSecretHandlingPolicy).toHaveBeenCalledWith(db, 'user-1');
    expect(mocks.saveScheduleShare).toHaveBeenCalledWith(db, 'user-1', 'task-1', redacted);
  });

  it('DELETE unshares the caller schedule', async () => {
    const response = await call('DELETE');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mocks.unshareSchedule).toHaveBeenCalledWith(db, 'user-1', 'task-1');
  });
});
