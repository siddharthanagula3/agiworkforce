import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { getRoutingSlotModel } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/app/api/llm/v1/chat/completions/lib/auth-gate');
type ScanModule1 = typeof import('@/lib/rate-limit');
type ScanModule2 = typeof import('@/lib/managed-compute-gate');
type ScanModule3 = typeof import('@/lib/services/free-lane/free-quota-fallback');

const mocks = vi.hoisted(() => ({ auth: vi.fn(), gate: vi.fn(), fallback: vi.fn() }));

vi.mock('@/app/api/llm/v1/chat/completions/lib/auth-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  runAuthGate: mocks.auth,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  acquireManagedTurnSlot: vi.fn(async () => ({
    admitted: true,
    limit: null,
    active: 0,
    slot: { release: async () => {} },
  })),
}));
vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  buildManagedComputeGateResponse: mocks.gate,
}));
vi.mock('@/lib/services/free-lane/free-quota-fallback', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  serveFreeQuotaFallback: mocks.fallback,
}));

const { POST } = await import('@/app/api/llm/v1/chat/completions/route');

const FREE_AUTO = getRoutingSlotModel('router_zero_cost');
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

beforeEach(() => {
  mocks.auth.mockReset();
  mocks.fallback.mockReset();
  mocks.gate
    .mockReset()
    .mockReturnValue(
      NextResponse.json(
        { error: { code: 'free_allowance_exhausted', message: 'Free Auto is spent.' } },
        { status: 429 },
      ),
    );
});

describe('a Free Auto turn the chat route refuses', () => {
  it('is offered to the free quota fallback on the Free plan, with the request it refused', async () => {
    signedIn('free');
    mocks.fallback.mockResolvedValue(
      new Response('data: [DONE]\n\n', {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'X-AGI-Fallback-Reason': 'free_limit_reached',
        },
      }),
    );

    const response = await send();

    expect(mocks.fallback).toHaveBeenCalledTimes(1);
    const [input] = mocks.fallback.mock.calls[0] as [
      { refusal: Response; replay: Request; userId: string },
    ];
    expect(input.refusal.status).toBe(429);
    expect(input.userId).toBe('user-1');
    expect(await input.replay.json()).toEqual(BODY);
    expect(response.status).toBe(200);
    expect(response.headers.get('X-AGI-Fallback-Reason')).toBe('free_limit_reached');
    expect(await response.text()).toBe('data: [DONE]\n\n');
  });

  it('keeps its own refusal on the Free plan when no free quota model can answer', async () => {
    signedIn('free');
    mocks.fallback.mockResolvedValue(null);

    const response = await send();

    expect(mocks.fallback).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe('free_allowance_exhausted');
  });

  it.each([
    ['a paid plan', 'pro', undefined],
    ['an API key', 'free', 'key-1'],
  ])('is never offered to the fallback for %s', async (_label, planTier, apiKeyId) => {
    signedIn(planTier, apiKeyId);

    const response = await send();

    expect(mocks.fallback).not.toHaveBeenCalled();
    expect(response.status).toBe(429);
  });
});
