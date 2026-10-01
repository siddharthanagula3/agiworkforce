import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/security-audit');

const { auditSpy } = vi.hoisted(() => ({
  auditSpy: vi.fn(async (_event: Record<string, unknown>) => undefined),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  recordAuditEvent: auditSpy,
}));
import { ChatCodeRunResponseSchema } from '@agiworkforce/cloud-contracts';
import { createError } from '@/lib/errors';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  e2bEnabled: vi.fn(() => true),
  assertCapability: vi.fn(async (..._args: unknown[]) => undefined),
  codePolicy: vi.fn(async () => ({ allowed: true }) as { allowed: boolean; reason?: string }),
  computeAccess: vi.fn(async () => ({
    allowed: true,
    code: 'allowed',
    reason: '',
    organizationId: null,
  })),
  getExecutor: vi.fn(),
  runCode: vi.fn(),
  dispose: vi.fn(async () => undefined),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-1',
    organizationId: null,
  }),
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
  requireCsrfToken: vi.fn(async () => null),
}));
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
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
  appendVary: vi.fn(),
  getCorsHeaders: vi.fn(),
  getSecurityHeaders: vi.fn(),
  isOriginAllowed: vi.fn(),
  jsonResponseWithCors: vi.fn(),
  requireValidOrigin: vi.fn(),
  withCorsAndSecurityHeaders: vi.fn(),
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/e2b/gate', () => ({
  E2B_API_KEY_ENV: vi.fn(),
  E2B_EXECUTION_ENV: vi.fn(),
  e2bProvisioningReady: vi.fn(),
  managedComputeBetaEnabled: vi.fn(),
  e2bExecutionEnabled: vi.fn(() => false),
  e2bCutoverEnabled: () => mocks.e2bEnabled(),
}));
vi.mock('@/lib/e2b/runtime', () => ({
  closeBillableInterval: vi.fn(),
  killE2BSession: vi.fn(),
  pauseE2BSession: vi.fn(),
  revokeE2BSessionCredentials: vi.fn(),
  terminateE2BSessionProcesses: vi.fn(),
  getE2BExecutor: (...args: unknown[]) => mocks.getExecutor(...args),
}));
vi.mock('@/lib/feature-flags/capability-gate', () => ({
  readKillSwitchGate: vi.fn(),
  assertCapabilityAvailable: (...args: unknown[]) => mocks.assertCapability(...args),
}));
vi.mock('@/lib/feature-flags/flag-evaluation-service', () => ({
  normalizeClientVersion: vi.fn(),
  evaluateFlagsForSubject: vi.fn(async () => ({})),
  buildFlagSubject: (_request: unknown, facts: unknown) => facts,
}));
vi.mock('@/lib/free-chat-surface-policy', () => ({
  bindSurfaceFromClaims: vi.fn(),
  canUseManagedCloudChatSurface: vi.fn(),
  getCloudChatSurfaceCapability: vi.fn(),
  readSurfaceHint: vi.fn(),
  resolveCloudChatSurface: () => 'web',
}));
vi.mock('@/lib/server/code-execution-policy', () => ({
  CODE_EXECUTION_SETTINGS_NAMESPACE: vi.fn(),
  CODE_EXECUTION_SETTING_KEY: vi.fn(),
  resolveCloudCodeExecutionPolicy: () => mocks.codePolicy(),
}));
vi.mock('@/lib/services/entitlement-resolution', () => ({
  ensureSeatMemberCreditAccount: vi.fn(),
  isSeatBearingBillingPlan: vi.fn(),
  resolveEffectiveSubscription: vi.fn(),
  resolveEntitledPlanTier: vi.fn(),
  resolveEntitlementBundle: async () => ({ plan: 'pro', subscription: null }),
}));
vi.mock('@/lib/services/managed-compute-access', async () => {
  const { NextResponse } = await import('next/server');
  return {
    evaluateManagedComputeSubscriptionAccess: vi.fn(),
    evaluateManagedComputeWorkspaceAccess: vi.fn(),
    evaluateManagedComputeAccess: () => mocks.computeAccess(),
    buildManagedComputeAccessGateResponse: (decision: { allowed: boolean; code: string }) =>
      decision.allowed
        ? null
        : NextResponse.json({ error: { code: decision.code } }, { status: 403 }),
  };
});

const { POST } = await import('./route');

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const context = { params: Promise.resolve({ id: CONVERSATION_ID }) };

function request(body: unknown = { language: 'python', code: 'print(1)' }) {
  return new NextRequest(
    `https://agiworkforce.com/api/chat/conversations/${CONVERSATION_ID}/code-runs`,
    { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } },
  );
}

describe('POST /api/chat/conversations/[id]/code-runs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([{ id: CONVERSATION_ID }]);
    mocks.runCode.mockResolvedValue({ ok: true, output: '1', pngResults: ['iVBORw0KGgo='] });
    mocks.getExecutor.mockResolvedValue({ runCode: mocks.runCode, dispose: mocks.dispose });
  });

  it('runs the cell in the conversation sandbox and returns its output', async () => {
    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    const body = ChatCodeRunResponseSchema.parse(await response.json());
    expect(body).toEqual({ ok: true, output: '1', error: null, images: ['iVBORw0KGgo='] });
    expect(mocks.getExecutor.mock.calls[0]![0]).toMatchObject({
      userId: 'user-1',
      conversationId: CONVERSATION_ID,
    });
    expect(mocks.runCode).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'python', code: 'print(1)' }),
    );
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });

  it('records the rerun as a tool execution by name, never the code or its output', async () => {
    const response = await POST(
      request({ language: 'python', code: 'print("payroll-secret")' }),
      context,
    );

    expect(response.status).toBe(200);
    expect(auditSpy).toHaveBeenCalledTimes(1);
    const event = auditSpy.mock.calls[0]![0];
    expect(event).toMatchObject({
      userId: 'user-1',
      eventType: 'tool_executed',
      outcome: 'success',
    });
    expect(event['detail']).toEqual({
      resourceType: 'tool',
      resourceId: 'execute_code',
      source: 'code-execution',
      status: 'completed',
      conversationId: CONVERSATION_ID,
      durationMs: expect.any(Number),
    });
    expect(JSON.stringify(event)).not.toMatch(/payroll-secret|iVBORw0KGgo/);
  });

  it('records a failed rerun as a failed tool execution', async () => {
    mocks.runCode.mockResolvedValue({ ok: false, output: '', error: 'NameError' });

    await POST(request(), context);

    expect(auditSpy.mock.calls[0]![0]).toMatchObject({
      eventType: 'tool_executed',
      outcome: 'failure',
      detail: expect.objectContaining({ status: 'failed' }),
    });
    expect(JSON.stringify(auditSpy.mock.calls[0]![0])).not.toContain('NameError');
  });

  it('answers 404 for a conversation the caller does not own', async () => {
    mocks.query.mockResolvedValue([]);

    const response = await POST(request(), context);

    expect(response.status).toBe(404);
    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(sql).toContain('user_id = $2');
    expect(sql).toContain('deleted_at is null');
    expect(params).toEqual([CONVERSATION_ID, 'user-1', null]);
    expect(mocks.getExecutor).not.toHaveBeenCalled();
  });

  it('refuses while the cloud execution switch is closed', async () => {
    mocks.assertCapability.mockRejectedValueOnce(
      createError.serviceUnavailable('Running code is temporarily switched off.').asUserSafe(),
    );

    const response = await POST(request(), context);

    expect(response.status).toBe(503);
    expect(mocks.assertCapability).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', plan: 'pro', surface: 'web' }),
      'canUseCloudExecution',
      'Running code',
    );
    expect(mocks.getExecutor).not.toHaveBeenCalled();
  });

  it('refuses when the account turned code execution off', async () => {
    mocks.codePolicy.mockResolvedValueOnce({ allowed: false, reason: 'disabled' });

    const response = await POST(request(), context);

    expect(response.status).toBe(403);
    expect(mocks.getExecutor).not.toHaveBeenCalled();
  });

  it('refuses when managed compute access is denied', async () => {
    mocks.computeAccess.mockResolvedValueOnce({
      allowed: false,
      code: 'spend_limit_reached',
      reason: 'Spend limit reached.',
      organizationId: null,
    });

    const response = await POST(request(), context);

    expect(response.status).toBe(403);
    expect(mocks.getExecutor).not.toHaveBeenCalled();
  });

  it('refuses when the sandbox compute cannot be reserved', async () => {
    mocks.getExecutor.mockImplementationOnce(
      async (_scope: unknown, onUnavailable: (cause: string) => void) => {
        onUnavailable('over-quota');
        return null;
      },
    );

    const response = await POST(request(), context);

    expect(response.status).toBe(503);
    expect(mocks.runCode).not.toHaveBeenCalled();
  });

  it('refuses when the deployment does not run code', async () => {
    mocks.e2bEnabled.mockReturnValueOnce(false);

    const response = await POST(request(), context);

    expect(response.status).toBe(503);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
