import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/types';

type RateLimitModule = typeof import('@/lib/rate-limit');
type CsrfModule = typeof import('@/lib/csrf');
type ApiAuthModule = typeof import('@/lib/api-auth');
type SubscriptionModule = typeof import('@/lib/services/effective-subscription-service');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type ClaimedScopeModule = typeof import('@/lib/server/claimed-user-scope-db');
type TurnSlotModule = typeof import('../lib/turn-slot');
type SecretGateModule = typeof import('../lib/secret-handling-gate');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type RunServiceModule = typeof import('@/lib/services/cloud-agent-run-service');

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  csrf: vi.fn(),
  identity: vi.fn(),
  subscription: vi.fn(),
  turnSlot: vi.fn(),
  secretGate: vi.fn(),
  scopedDb: vi.fn(),
  claim: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: mocks.rateLimit,
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: mocks.csrf,
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<ApiAuthModule>()),
  getClerkAuthUser: mocks.identity,
}));
vi.mock('@/lib/services/effective-subscription-service', async (importOriginal) => ({
  ...(await importOriginal<SubscriptionModule>()),
  resolveEffectiveSubscription: mocks.subscription,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: vi.fn(() => ({})),
}));
vi.mock('@/lib/server/claimed-user-scope-db', async (importOriginal) => ({
  ...(await importOriginal<ClaimedScopeModule>()),
  createClaimedUserScopedDb: vi.fn(() => ({})),
}));
vi.mock('../lib/turn-slot', async (importOriginal) => ({
  ...(await importOriginal<TurnSlotModule>()),
  withManagedTurnSlot: mocks.turnSlot,
}));
vi.mock('../lib/secret-handling-gate', async (importOriginal) => ({
  ...(await importOriginal<SecretGateModule>()),
  applySecretHandlingToTexts: mocks.secretGate,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: mocks.scopedDb,
}));
vi.mock('@/lib/services/cloud-agent-run-service', async (importOriginal) => ({
  ...(await importOriginal<RunServiceModule>()),
  claimCloudAgentCallerCheckpoint: mocks.claim,
}));

import { ApiKeyScopeError } from '@/lib/api-key-scope-error';
import { POST } from './route';

function resumeRequest(
  headers: Record<string, string> = { authorization: `Bearer ${'t'.repeat(40)}` },
) {
  return new NextRequest('http://localhost:3000/api/llm/v1/chat/completions/resume-caller', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      schema_version: AGENT_EVENT_SCHEMA_VERSION,
      run_id: '0190a000-0000-7000-8000-000000000001',
      turn_id: 'original-turn-1',
      next_event_sequence: 8,
      tool_results: [{ tool_call_id: 'local-1', content: 'local result' }],
    }),
  });
}

function expectNothingWritten() {
  expect(mocks.turnSlot).not.toHaveBeenCalled();
  expect(mocks.secretGate).not.toHaveBeenCalled();
  expect(mocks.scopedDb).not.toHaveBeenCalled();
  expect(mocks.claim).not.toHaveBeenCalled();
}

describe('POST /api/llm/v1/chat/completions/resume-caller admission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(null);
    mocks.csrf.mockResolvedValue(null);
    mocks.identity.mockResolvedValue({ userId: 'user-1' });
    mocks.subscription.mockResolvedValue(null);
  });

  it('refuses a request that carries only a session cookie before resolving anyone', async () => {
    const response = await POST(resumeRequest({ cookie: '__session=fixture' }));

    expect(response.status).toBe(401);
    expect(mocks.identity).not.toHaveBeenCalled();
    expectNothingWritten();
  });

  it('refuses a request without a valid CSRF token', async () => {
    mocks.csrf.mockResolvedValue(
      NextResponse.json(
        { error: 'Invalid or missing CSRF token', code: 'CSRF_VALIDATION_FAILED' },
        { status: 403 },
      ),
    );

    const request = resumeRequest();
    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'CSRF_VALIDATION_FAILED' });
    expect(mocks.csrf).toHaveBeenCalledWith(request);
    expectNothingWritten();
  });

  it('refuses a caller over its configured rate limit', async () => {
    mocks.rateLimit.mockImplementation(async (_request: NextRequest, bucket: string) =>
      bucket === 'llm-completion'
        ? NextResponse.json({ error: { code: 'rate_limit_exceeded' } }, { status: 429 })
        : null,
    );

    const request = resumeRequest();
    const response = await POST(request);

    expect(response.status).toBe(429);
    expect(mocks.rateLimit).toHaveBeenCalledWith(request, 'llm-completion-ip');
    expect(mocks.rateLimit).toHaveBeenCalledWith(request, 'llm-completion', 'user:user-1');
    expectNothingWritten();
  });

  it('refuses an API key without the inference scope', async () => {
    mocks.identity.mockRejectedValue(new ApiKeyScopeError('missing inference:write'));

    const request = resumeRequest({ authorization: `Bearer sk_live_${'k'.repeat(40)}` });
    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'insufficient_scope' } });
    expect(mocks.identity).toHaveBeenCalledWith(request, { apiKeyScope: 'inference:write' });
    expectNothingWritten();
  });
});
