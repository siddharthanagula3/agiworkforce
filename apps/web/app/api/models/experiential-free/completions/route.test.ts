// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getProviderOfferings } from '@agiworkforce/types';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  plan: vi.fn(),
  offerings: vi.fn(),
  privacy: vi.fn(),
  retention: vi.fn(),
  egress: vi.fn(),
  fetch: vi.fn(),
  persistUser: vi.fn(),
}));

vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-auth')>()),
  assertAccountActive: vi.fn(async () => undefined),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/rls-db')>()),
  getUserScopedDb: vi.fn(async () => ({
    userId: 'fixture-user',
    organizationId: null,
    db: { query: mocks.query },
  })),
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/entitlement-resolution')>()),
  resolveEntitledPlanTier: mocks.plan,
}));
vi.mock('@/lib/server/free-quota-catalogue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/free-quota-catalogue')>()),
  freeQuotaPlanAllows: (plan: string) => plan === 'free',
  loadFreeQuotaPolicy: () => ({ chatMaxOutputTokens: 1024, chatRequestTimeoutMs: 30_000 }),
}));
vi.mock('@/lib/server/experiential-free', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/experiential-free')>()),
  experientialFreeConfiguration: () => ({
    baseUrl: 'https://api.experientiallabs.ai/v1',
    apiKey: 'fixture-key',
  }),
  loadExperientialFreeOfferings: mocks.offerings,
}));
vi.mock('@/lib/moderation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/moderation')>()),
  moderateManagedPrompt: () => ({ allowed: true }),
}));
vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-content-safety-service')>()),
  enforceManagedContentSafetyPreference: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/managed-compute-gate', () => ({
  buildModelPolicyGateResponse: vi.fn(async () => null),
  buildProviderEgressGateResponse: mocks.egress,
}));
vi.mock('@/lib/services/organization-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/organization-policy-gate')>()),
  evaluateActiveWorkspacePolicy: mocks.privacy,
  resolveZeroDataRetentionPolicy: mocks.retention,
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/secret-handling-gate', () => ({
  applySecretHandlingToTexts: vi.fn(async (_user: string, texts: string[]) => ({
    action: 'clean',
    texts,
  })),
}));
vi.mock('@/app/api/chat/conversations/[id]/messages/lib/persist-message', () => ({
  persistConversationMessage: mocks.persistUser,
}));

const { POST } = await import('./route');
const [key, offering] = Object.entries(getProviderOfferings()).find(
  ([, candidate]) => candidate.provider === 'experientiallabs' && candidate.category === 'chat',
)!;

function request(patch: Record<string, unknown> = {}) {
  return POST(
    new NextRequest('http://localhost:3100/api/models/experiential-free/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: key,
        conversation_id: '52d14f7e-0b3d-40c7-952d-987e841033c5',
        assistant_message_id: '62d14f7e-0b3d-40c7-952d-987e841033c5',
        messages: [{ role: 'user', content: 'Reply with OK' }],
        ...patch,
      }),
    }),
  );
}

beforeEach(() => {
  mocks.query.mockReset().mockResolvedValue([{ id: 'conversation', data_region: null }]);
  mocks.plan.mockReset().mockResolvedValue('free');
  mocks.offerings.mockReset().mockResolvedValue([{ key, offering, promotional: true }]);
  mocks.privacy.mockReset().mockResolvedValue({ allowed: true });
  mocks.retention.mockReset().mockResolvedValue({ required: false });
  mocks.egress.mockReset().mockResolvedValue(null);
  mocks.fetch.mockReset().mockResolvedValue(
    new Response(
      'data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      {
        headers: { 'Content-Type': 'text/event-stream' },
      },
    ),
  );
  mocks.persistUser.mockReset().mockResolvedValue({ id: 'persisted-user' });
  vi.stubGlobal('fetch', mocks.fetch);
});

describe('Experiential Labs free-only chat route', () => {
  it('persists the user message before contacting the free provider', async () => {
    const response = await request({
      user_message: {
        id: '72d14f7e-0b3d-40c7-952d-987e841033c5',
        metadata: {},
      },
    });

    expect(response.status).toBe(200);
    expect(mocks.persistUser).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          id: '72d14f7e-0b3d-40c7-952d-987e841033c5',
          role: 'user',
          content: 'Reply with OK',
        }),
      }),
    );
    expect(mocks.persistUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.fetch.mock.invocationCallOrder[0]!,
    );
  });

  it('refuses to contact the provider when the user message cannot be saved', async () => {
    mocks.persistUser.mockRejectedValueOnce(new Error('database unavailable'));
    const response = await request({
      user_message: { id: '72d14f7e-0b3d-40c7-952d-987e841033c5', metadata: {} },
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: 'user_message_persistence_failed' },
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('sends the curated model through only its :free route and streams the response', async () => {
    const response = await request({ max_tokens: 4096 });

    expect(response.status).toBe(200);
    expect(response.headers.get('X-AGI-Route-Lane')).toBe('free');
    expect(response.headers.get('X-AGI-Resolved-Provider')).toBe('experientiallabs');
    expect(await response.text()).toContain('"content":"OK"');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe('https://api.experientiallabs.ai/v1/chat/completions');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer fixture-key' });
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: `${offering.providerModelId}:free`,
      stream: true,
      max_tokens: 1024,
    });
  });

  it('translates an empty free provider completion into a user-safe stream error', async () => {
    mocks.fetch.mockResolvedValue(
      new Response('data: [DONE]\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    const text = await (await request()).text();
    expect(text).toContain('free_model_empty_response');
    expect(text).toContain('choose another free model');
  });

  it('does not forward a raw streamed provider error', async () => {
    mocks.fetch.mockResolvedValue(
      new Response('data: {"error":{"message":"private provider diagnostic"}}\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    const text = await (await request()).text();
    expect(text).toContain('free_model_stream_failed');
    expect(text).not.toContain('private provider diagnostic');
  });

  it('refuses a non-Free account before provider traffic', async () => {
    mocks.plan.mockResolvedValue('pro');
    expect((await request()).status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('fails closed when the selected promotion is no longer free', async () => {
    mocks.offerings.mockResolvedValue([{ key, offering, promotional: false }]);
    expect((await request()).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('refuses a retention policy this provider route cannot satisfy', async () => {
    mocks.retention.mockResolvedValue({ required: true });
    expect((await request()).status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('refuses tool-bearing requests without contacting the provider', async () => {
    const response = await request({ web_search: true });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'free_quota_search_unsupported',
        message: expect.stringContaining('Choose a search-capable Free model'),
      },
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('refuses an explicit search request instead of asking a text-only model to invent a result', async () => {
    const response = await request({
      messages: [
        { role: 'user', content: 'Search the web for the official IANA page and cite it.' },
      ],
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'free_quota_search_unsupported',
        message: expect.stringContaining('Free Auto'),
      },
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('refuses explicit URL fetch before contacting a promotional provider', async () => {
    const response = await request({
      messages: [{ role: 'user', content: 'Summarize https://www.iana.org/help/example-domains.' }],
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('free_quota_search_unsupported');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('refuses explicit code execution rather than inviting a fabricated sandbox result', async () => {
    const response = await request({
      messages: [{ role: 'user', content: 'Run Python to calculate 17 * 19.' }],
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'free_quota_code_unsupported',
        message: expect.stringContaining('Free Auto'),
      },
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('does not fall back to a paid route when the free limit is reached', async () => {
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'free_limit_reached' } }), { status: 429 }),
    );
    const response = await request();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'free_quota_exhausted',
        message: expect.stringContaining("We didn't switch models or charge your account"),
      },
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('distinguishes a busy free provider from an exhausted promotion', async () => {
    mocks.fetch.mockResolvedValue(new Response('{}', { status: 429 }));
    const response = await request();

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'provider_rate_limited',
        message: expect.stringContaining('Try again shortly or choose another free model'),
      },
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('explains an upstream failure without claiming a fallback happened', async () => {
    mocks.fetch.mockResolvedValue(new Response('{}', { status: 503 }));
    const response = await request();

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'provider_unreachable',
        message: expect.stringContaining("We didn't switch models or charge your account"),
      },
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('gives a safe next step when the provider connection fails', async () => {
    mocks.fetch.mockRejectedValue(new Error('connection reset'));
    const response = await request();

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'provider_unreachable',
        message: expect.stringContaining('Try again or choose another free model'),
      },
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});
