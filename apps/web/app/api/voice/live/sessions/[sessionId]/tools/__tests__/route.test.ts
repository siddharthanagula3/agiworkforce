// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getClerkAuthUser: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  isVoiceSessionStoreReady: vi.fn(),
  touchVoiceSession: vi.fn(),
  handleLiveVoiceToolCall: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  assertAccountActive: vi.fn(),
  getClerkAuthorizedParties: vi.fn(),
  getOptionalAuthUser: vi.fn(),
  getSuspendedAccountUser: vi.fn(),
  isAccountUnavailableError: vi.fn(),
  getClerkAuthUser: mocks.getClerkAuthUser,
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
vi.mock('@/lib/cors', () => ({
  appendVary: vi.fn(),
  isOriginAllowed: vi.fn(),
  jsonResponseWithCors: vi.fn(),
  requireValidOrigin: vi.fn(),
  withCorsAndSecurityHeaders: vi.fn(),
  withCorsRoute: vi.fn(),
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
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
vi.mock('@/lib/voice/live-voice-tool-runner', () => ({
  handleLiveVoiceToolCall: mocks.handleLiveVoiceToolCall,
}));
vi.mock('../../../lib/voice-session-store', () => ({
  VOICE_PACE_DEFAULT: 1,
  VOICE_PACE_MAX: 4,
  VOICE_PACE_MIN: 0.25,
  clampVoicePace: vi.fn(),
  closeExpiredVoiceSessions: vi.fn(),
  closeVoiceSession: vi.fn(),
  closeVoiceSessionsForConversation: vi.fn(),
  createVoiceSession: vi.fn(),
  getActiveVoiceSessionForConversation: vi.fn(),
  getVoiceSessionByProviderId: vi.fn(),
  listVoiceSessionHistory: vi.fn(),
  meteredVoiceSessionSeconds: vi.fn(),
  updateVoiceSessionSettings: vi.fn(),
  isVoiceSessionStoreReady: mocks.isVoiceSessionStoreReady,
  touchVoiceSession: mocks.touchVoiceSession,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const SESSION_ID = 'sess_provider_1';
const db = { query: vi.fn() };
const session = {
  organizationId: 'org-1',
  conversationId: 'conv-1',
  modelId: 'gpt-realtime',
  activeTools: ['web_search'],
};
const call = { callId: 'call-1', name: 'web_search', arguments: '{"q":"weather"}' };

function request(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/voice/live/sessions/${SESSION_ID}/tools`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ sessionId: SESSION_ID }) };

describe('POST /api/voice/live/sessions/[sessionId]/tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-1' });
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1' });
    mocks.isVoiceSessionStoreReady.mockResolvedValue(true);
    mocks.touchVoiceSession.mockResolvedValue(session);
    mocks.handleLiveVoiceToolCall.mockResolvedValue({ status: 'completed', output: 'sunny' });
  });

  it('refuses a request without a session', async () => {
    mocks.getClerkAuthUser.mockRejectedValue(createError.unauthorized());

    const response = await POST(request(call), context);

    expect(response.status).toBe(401);
    expect(mocks.handleLiveVoiceToolCall).not.toHaveBeenCalled();
  });

  it('refuses a request that fails the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));

    const response = await POST(request(call), context);

    expect(response.status).toBe(403);
    expect(mocks.getClerkAuthUser).not.toHaveBeenCalled();
  });

  it('returns the rate limit response and keys it on the caller', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({}, { status: 429 }));

    const response = await POST(request(call), context);

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'llm-completion',
      'user:user-1',
    );
  });

  it('rejects a malformed tool call', async () => {
    const response = await POST(request({ callId: 'call-1' }), context);

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe('invalid_request_error');
    expect(mocks.handleLiveVoiceToolCall).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON', async () => {
    const response = await POST(request('not json'), context);

    expect(response.status).toBe(400);
  });

  it('refuses when the scoped database belongs to another user', async () => {
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-2' });

    const response = await POST(request(call), context);

    expect(response.status).toBe(403);
    expect(mocks.touchVoiceSession).not.toHaveBeenCalled();
  });

  it('returns 503 when voice session records are unavailable', async () => {
    mocks.isVoiceSessionStoreReady.mockResolvedValue(false);

    const response = await POST(request(call), context);

    expect(response.status).toBe(503);
    expect(mocks.touchVoiceSession).not.toHaveBeenCalled();
  });

  it('returns 404 when the caller has no open session with that id', async () => {
    mocks.touchVoiceSession.mockResolvedValue(null);

    const response = await POST(request(call), context);

    expect(response.status).toBe(404);
    expect(mocks.touchVoiceSession).toHaveBeenCalledWith({
      db,
      userId: 'user-1',
      providerSessionId: SESSION_ID,
    });
    expect(mocks.handleLiveVoiceToolCall).not.toHaveBeenCalled();
  });

  it('runs the tool for the session owner and returns its result', async () => {
    const response = await POST(request(call), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'completed', output: 'sunny' });
    expect(mocks.handleLiveVoiceToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        db,
        userId: 'user-1',
        organizationId: 'org-1',
        conversationId: 'conv-1',
        modelId: 'gpt-realtime',
        offeredTools: ['web_search'],
        call,
      }),
    );
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('audits an approval decision once the tool has run', async () => {
    const response = await POST(request({ ...call, decision: 'approved' }), context);

    expect(response.status).toBe(200);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-1',
        eventType: 'tool_approval_decided',
        surface: 'voice',
        detail: expect.objectContaining({
          resourceId: 'call-1',
          resourceName: 'web_search',
          status: 'approved',
          conversationId: 'conv-1',
        }),
      }),
    );
  });

  it('does not audit a decision that still needs approval', async () => {
    mocks.handleLiveVoiceToolCall.mockResolvedValue({ status: 'approval_required' });

    const response = await POST(request({ ...call, decision: 'rejected' }), context);

    expect(response.status).toBe(200);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});
