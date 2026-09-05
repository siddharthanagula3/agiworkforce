import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  resolveIdentity: vi.fn(),
  answer: vi.fn(),
  enabled: vi.fn(),
  resolveContext: vi.fn(),
  scopedDb: { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() },
  listActions: vi.fn(),
  requireHumanCaller: vi.fn(),
}));

vi.hoisted(() => {
  process.env['NEXT_PUBLIC_APP_URL'] = 'https://agiworkforce.com';
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/server/rls-db', () => ({
  getCurrentUserRlsDb: async () => ({ db: mocks.scopedDb, userId: 'user-1' }),
}));
vi.mock('@/lib/support/handoff/request-identity', () => ({
  resolveHandoffIdentity: mocks.resolveIdentity,
}));
vi.mock('@/lib/support/agent', () => ({
  answerSupportQuestion: mocks.answer,
  isSupportAgentEnabled: mocks.enabled,
}));
vi.mock('@/lib/support/account/context-resolver', () => ({
  resolveSupportAccountContext: mocks.resolveContext,
}));
vi.mock('@/lib/support/actions/service', () => ({
  listAvailableSupportActions: mocks.listActions,
}));
vi.mock('@/lib/security/bot-challenge', () => ({
  requireHumanCaller: mocks.requireHumanCaller,
}));

const { createError } = await import('@/lib/errors');
const { BOT_CHALLENGED_ENDPOINTS } = await import('@/lib/security/bot-challenge-routes');
const { POST } = await import('./route');

const ANSWER = {
  kind: 'answer' as const,
  text: 'Open Settings > Billing.',
  citations: [
    { title: 'Billing', url: '/settings/billing', snippet: '', docId: 'd', chunkId: 'c' },
  ],
  proposedActionId: null,
  route: { provider: 'anthropic', modelKey: 'x' },
  handoffOffered: false,
};

const CONTEXT = {
  plan: {
    tier: 'pro',
    effectiveTier: 'pro',
    displayName: 'Pro',
    status: 'active',
    currentPeriodEnd: null,
    subscriptionSource: 'stripe' as const,
  },
  usage: { usagePercentage: 42, hasUsageRemaining: true },
  connectors: [],
  apiKeys: { activeCount: 2, atCeiling: false },
  email: { present: true, verified: 'verified' as const },
  resolvedAt: '2026-08-05T00:00:00.000Z',
};

function post(body: unknown): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/support/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const QUESTION = { message: 'How do I change my plan?', surface: 'app', history: [] };

describe('POST /api/support/ask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.resolveIdentity.mockResolvedValue({ userId: 'user-1', ownerSessionKey: 'user-1' });
    mocks.enabled.mockReturnValue(true);
    mocks.answer.mockResolvedValue(ANSWER);
    mocks.resolveContext.mockResolvedValue(CONTEXT);
    mocks.listActions.mockReturnValue({ actions: [{ id: 'a', title: 'A', description: 'D' }] });
    mocks.requireHumanCaller.mockResolvedValue(undefined);
  });

  it('challenges the caller before spending a model call', async () => {
    mocks.requireHumanCaller.mockRejectedValue(createError.forbidden());

    const response = await POST(post(QUESTION));

    expect(response.status).toBe(403);
    expect(mocks.requireHumanCaller).toHaveBeenCalledWith(BOT_CHALLENGED_ENDPOINTS.supportAsk);
    expect(mocks.answer).not.toHaveBeenCalled();
  });

  it('answers a grounded question through the support engine', async () => {
    const response = await POST(post(QUESTION));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(ANSWER);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('reports the agent as switched off rather than as a broken request', async () => {
    mocks.enabled.mockReturnValue(false);

    const response = await POST(post(QUESTION));

    expect(response.status).toBe(501);
    expect(mocks.answer).not.toHaveBeenCalled();
  });

  it('refuses before doing any work when the CSRF token is missing', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    await POST(post(QUESTION));

    expect(mocks.resolveIdentity).not.toHaveBeenCalled();
    expect(mocks.answer).not.toHaveBeenCalled();
  });

  it('buckets an anonymous asker separately from a signed-in one', async () => {
    mocks.resolveIdentity.mockResolvedValue({ userId: null, ownerSessionKey: 'anon-1' });

    await POST(post({ ...QUESTION, surface: 'marketing' }));

    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'support-agent-anon',
      undefined,
    );
    const [input] = mocks.answer.mock.calls[0]!;
    expect(input.viewer).toEqual({ isSignedIn: false, userId: null, planTier: null });
    expect(input.accountFacts).toEqual([]);
    expect(input.availableActions).toEqual([]);
  });

  it('never sends another user account context to the model', async () => {
    await POST(post(QUESTION));

    expect(mocks.resolveContext).toHaveBeenCalledWith(mocks.scopedDb, 'user-1');
    const [input] = mocks.answer.mock.calls[0]!;
    expect(input.viewer.userId).toBe('user-1');
    expect(input.accountFacts).toEqual(
      expect.arrayContaining([{ label: 'Plan', value: 'pro', sourceUrl: '/settings/billing' }]),
    );
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'support-agent-user',
      'user:user-1',
    );
  });

  it('still answers when account context cannot be resolved', async () => {
    mocks.resolveContext.mockRejectedValue(new Error('db down'));

    const response = await POST(post(QUESTION));

    expect(response.status).toBe(200);
    const [input] = mocks.answer.mock.calls[0]!;
    expect(input.accountFacts).toEqual([]);
  });

  it('rejects an empty or oversized question instead of calling the model', async () => {
    expect((await POST(post({ ...QUESTION, message: '   ' }))).status).toBe(400);
    expect((await POST(post({ ...QUESTION, message: 'x'.repeat(2001) }))).status).toBe(400);
    expect((await POST(post({ ...QUESTION, surface: 'desktop' }))).status).toBe(400);
    expect(mocks.answer).not.toHaveBeenCalled();
  });

  it('stops at the rate limit without reaching the model', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await POST(post(QUESTION));

    expect(response.status).toBe(429);
    expect(mocks.answer).not.toHaveBeenCalled();
  });
});
