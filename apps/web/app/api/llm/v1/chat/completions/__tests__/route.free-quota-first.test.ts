import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { getRoutingSlotModel } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/app/api/llm/v1/chat/completions/lib/auth-gate');
type ScanModule1 = typeof import('@/lib/rate-limit');
type ScanModule2 = typeof import('@/lib/managed-compute-gate');
type ScanModule3 = typeof import('@/lib/services/free-lane/free-quota-fallback');
type ScanModule4 = typeof import('@/app/api/llm/v1/chat/completions/lib/request-processor');
type ScanModule5 = typeof import('@/lib/server/rls-db');

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  slot: vi.fn(),
  killSwitch: vi.fn(),
  workspacePolicy: vi.fn(),
  first: vi.fn(),
  fallback: vi.fn(),
  router: vi.fn(),
}));

vi.mock('@/app/api/llm/v1/chat/completions/lib/auth-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  runAuthGate: mocks.auth,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  acquireManagedTurnSlot: mocks.slot,
}));
vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  buildManagedComputeGateResponse: mocks.killSwitch,
  buildOrganizationPolicyGateResponse: mocks.workspacePolicy,
  buildSpendLimitGateResponse: vi.fn(async () => null),
  resolveWorkspaceControlsForRequest: vi.fn(async () => ({ ok: true, controls: null })),
}));
vi.mock('@/lib/services/free-lane/free-quota-fallback', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  serveFreeQuotaFirst: mocks.first,
  serveFreeQuotaFallback: mocks.fallback,
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/request-processor', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  processRequest: mocks.router,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  getVerifiedBearerUserScopedDb: vi.fn(async () => ({
    userId: 'user-1',
    organizationId: null,
    db: {},
  })),
}));

const { POST } = await import('@/app/api/llm/v1/chat/completions/route');

const FREE_AUTO = getRoutingSlotModel('router_zero_cost');
const LANE_MODEL = 'qwen-quota-fixture';
const BODY = {
  model: FREE_AUTO,
  stream: true,
  messages: [{ role: 'user', content: 'Hello' }],
};

function signedIn(planTier: string, apiKeyId?: string) {
  mocks.auth.mockResolvedValue({
    ok: true,
    userId: 'user-1',
    token: 'test-token',
    subscription: {
      id: `sub-${planTier}`,
      user_id: 'user-1',
      plan_tier: planTier,
      status: 'active',
      current_period_start: new Date(),
      current_period_end: new Date(Date.now() + 30 * 86_400_000),
      stripe_subscription_id: null,
      stripe_price_id: null,
    },
    ...(apiKeyId ? { apiKeyId } : {}),
  });
}

function send(): Promise<Response> {
  return POST(
    new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(BODY),
    }),
  );
}

function stream(text: string, headers: Record<string, string> = {}): Response {
  return new Response(`data: ${text}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', ...headers },
  });
}

function routerAnswers(response: Response) {
  mocks.router.mockResolvedValue({ ok: false, response });
}

function sharedPoolSpent(): NextResponse {
  return NextResponse.json(
    { error: { code: 'free_allowance_exhausted', message: 'Free Auto is spent.' } },
    { status: 429 },
  );
}

beforeEach(() => {
  mocks.auth.mockReset();
  mocks.slot.mockReset().mockResolvedValue({
    admitted: true,
    limit: null,
    active: 0,
    slot: { release: async () => {} },
  });
  mocks.killSwitch.mockReset().mockReturnValue(null);
  mocks.workspacePolicy.mockReset().mockResolvedValue(null);
  mocks.first.mockReset().mockResolvedValue({ response: null, tried: null });
  mocks.fallback.mockReset().mockResolvedValue(null);
  mocks.router.mockReset();
  routerAnswers(stream('from the free router', { 'X-AGI-Resolved-Model': FREE_AUTO }));
});

describe('a Free Auto turn the free quota lane is offered first', () => {
  it('is answered by the lane alone, inside one turn slot, and never reaches the free router', async () => {
    signedIn('free');
    mocks.first.mockResolvedValue({
      response: stream('from the free quota', { 'X-AGI-Resolved-Model': LANE_MODEL }),
      tried: LANE_MODEL,
    });

    const response = await send();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-AGI-Resolved-Model')).toBe(LANE_MODEL);
    expect(response.headers.get('X-AGI-Fallback-Reason')).toBeNull();
    expect(await response.text()).toContain('from the free quota');
    expect(mocks.first).toHaveBeenCalledTimes(1);
    const [input] = mocks.first.mock.calls[0] as [{ replay: Request; userId: string }];
    expect(input.userId).toBe('user-1');
    expect(await input.replay.json()).toEqual(BODY);
    expect(mocks.router).not.toHaveBeenCalled();
    expect(mocks.fallback).not.toHaveBeenCalled();
    expect(mocks.slot).toHaveBeenCalledTimes(1);
  });

  it('goes to the free router once when the lane hands it on, and the router answer carries no substitution notice', async () => {
    signedIn('free');
    mocks.first.mockResolvedValue({ response: null, tried: LANE_MODEL });

    const response = await send();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-AGI-Resolved-Model')).toBe(FREE_AUTO);
    expect(response.headers.get('X-AGI-Fallback-Reason')).toBeNull();
    expect(await response.text()).toContain('from the free router');
    expect(mocks.first).toHaveBeenCalledTimes(1);
    expect(mocks.router).toHaveBeenCalledTimes(1);
    expect(mocks.slot).toHaveBeenCalledTimes(1);
    expect(mocks.first.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.router.mock.invocationCallOrder[0]!,
    );
  });

  it('tells the fallback which allocation the lane already tried when the free router refuses too', async () => {
    signedIn('free');
    mocks.first.mockResolvedValue({ response: null, tried: LANE_MODEL });
    routerAnswers(sharedPoolSpent());

    const response = await send();

    expect(mocks.fallback).toHaveBeenCalledTimes(1);
    const [input] = mocks.fallback.mock.calls[0] as [
      { refusal: Response; replay: Request; tried: string | null },
    ];
    expect(input.tried).toBe(LANE_MODEL);
    expect(input.refusal.status).toBe(429);
    expect(await input.replay.json()).toEqual(BODY);
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe('free_allowance_exhausted');
  });

  it('returns a refusal the lane ends the turn with, without asking the free router', async () => {
    signedIn('free');
    mocks.first.mockResolvedValue({
      response: Response.json(
        { error: { code: 'content_policy_violation', message: 'Refused.' } },
        { status: 422 },
      ),
      tried: LANE_MODEL,
    });

    const response = await send();

    expect(response.status).toBe(422);
    expect(mocks.router).not.toHaveBeenCalled();
    expect(mocks.fallback).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the managed compute kill-switch is engaged',
      () =>
        mocks.killSwitch.mockReturnValue(
          NextResponse.json({ error: { code: 'public_launch_blocked' } }, { status: 403 }),
        ),
    ],
    [
      'the workspace policy refuses managed compute',
      () =>
        mocks.workspacePolicy.mockResolvedValue(
          NextResponse.json({ error: { code: 'organization_policy' } }, { status: 403 }),
        ),
    ],
  ])('is never offered to the lane while %s', async (_label, arrange) => {
    signedIn('free');
    arrange();

    const response = await send();

    expect(response.status).toBe(403);
    expect(mocks.first).not.toHaveBeenCalled();
    expect(mocks.router).not.toHaveBeenCalled();
  });

  it.each([
    ['a paid plan', 'pro', undefined],
    ['an API key', 'free', 'key-1'],
  ])('is never offered to the lane for %s', async (_label, planTier, apiKeyId) => {
    signedIn(planTier, apiKeyId);

    const response = await send();

    expect(response.status).toBe(200);
    expect(mocks.first).not.toHaveBeenCalled();
    expect(mocks.fallback).not.toHaveBeenCalled();
    expect(mocks.router).toHaveBeenCalledTimes(1);
  });
});
