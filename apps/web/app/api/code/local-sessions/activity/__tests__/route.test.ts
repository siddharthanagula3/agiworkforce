import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  readRequestingDevice: vi.fn(),
  notifyLocalCodeSessionEvent: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
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
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/device-steps/requesting-device', () => ({
  readRequestingDeviceId: vi.fn(),
  readRequestingDevice: mocks.readRequestingDevice,
}));
vi.mock('@/lib/services/agent-notification-service', () => ({
  AGENT_PUSH_PREFERENCE_KEY: 'mobilePushAgentActivity',
  cloudCodeTurnNotificationEvent: vi.fn(),
  notifyAgentRunEvent: vi.fn(),
  notifyCloudCodeTurnEvent: vi.fn(),
  notifyResearchReportSettled: vi.fn(),
  notifyLocalCodeSessionEvent: mocks.notifyLocalCodeSessionEvent,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const ACTIVITY = {
  event: 'approval_required',
  rootId: 'root-1',
  threadId: 'thread-1',
  turnId: 'turn-1',
  approvalId: 'approval-1',
  sessionTitle: 'Fix the build',
};

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/code/local-sessions/activity', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({ db: mocks.db, userId: 'user-1' });
  mocks.readRequestingDevice.mockResolvedValue({ name: 'Studio Mac' });
  mocks.notifyLocalCodeSessionEvent.mockResolvedValue({ pushed: 2 });
});

describe('POST /api/code/local-sessions/activity', () => {
  it('rejects a signed-out caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await POST(request(ACTIVITY));

    expect(response.status).toBe(401);
    expect(mocks.notifyLocalCodeSessionEvent).not.toHaveBeenCalled();
  });

  it('rate limits per user', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await POST(request(ACTIVITY));

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'code-session-activity',
      'user:user-1',
    );
  });

  it('returns the CSRF refusal bound to the caller', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request(ACTIVITY));

    expect(response.status).toBe(403);
    expect(mocks.requireCsrfToken).toHaveBeenCalledWith(expect.anything(), 'user-1');
    expect(mocks.notifyLocalCodeSessionEvent).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON and an unknown event', async () => {
    expect((await POST(request('{'))).status).toBe(400);
    expect((await POST(request({ ...ACTIVITY, event: 'started' }))).status).toBe(400);
    expect(mocks.notifyLocalCodeSessionEvent).not.toHaveBeenCalled();
  });

  it('notifies the caller with the requesting device name', async () => {
    const response = await POST(request(ACTIVITY));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pushed: 2 });
    expect(mocks.readRequestingDevice).toHaveBeenCalledWith(mocks.db, expect.anything(), 'user-1');
    expect(mocks.notifyLocalCodeSessionEvent).toHaveBeenCalledWith(mocks.db, {
      userId: 'user-1',
      deviceName: 'Studio Mac',
      activity: ACTIVITY,
    });
  });

  it('notifies without a device name when the device is unknown', async () => {
    mocks.readRequestingDevice.mockResolvedValue(null);

    await POST(request(ACTIVITY));

    expect(mocks.notifyLocalCodeSessionEvent).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ deviceName: null }),
    );
  });
});
