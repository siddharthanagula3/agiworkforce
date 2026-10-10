// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getModelMetadataById, getRoutingSlotModel } from '@agiworkforce/types';
import {
  describeDelegationTools,
  resolveLiveVoiceDelegationTools,
} from '@/lib/voice/live-voice-tools';
import { WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY } from '@shared/types/toolApprovalPolicy';
type ScanModule0 = typeof import('@/lib/server/provider-training-opt-out');
type ScanModule1 = typeof import('@/lib/services/entitlement-resolution');

const LIVE_MODEL = getModelMetadataById(getRoutingSlotModel('voice_live'))!;
const BACKEND_MODEL = getModelMetadataById(getRoutingSlotModel('voice_live_backend'))!;

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  finalize: vi.fn(),
  providerStarted: vi.fn(),
  clientDelivered: vi.fn(),
  entitlement: vi.fn(),
  planBlock: vi.fn(),
  userScopedDb: vi.fn(),
  fetch: vi.fn(),
  assertTierUnitAllowance: vi.fn(),
  requireEnv: vi.fn(),
  keepsOutOfTraining: vi.fn<(modelId: string) => boolean | null>(() => null),
}));

vi.mock('@/lib/server/provider-training-opt-out', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return {
    ...actual,
    modelKeepsInputsOutOfTraining: (modelId: string) =>
      mocks.keepsOutOfTraining(modelId) ?? actual.modelKeepsInputsOutOfTraining(modelId),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/feature-flags/capability-gate', () => ({
  readKillSwitchGate: vi.fn(async () => ({
    capabilityAllowed: () => true,
    modelAllowed: () => true,
    providerAllowed: () => true,
    tenantLockedDown: false,
    closedCapabilities: [],
  })),
  assertCapabilityAvailable: vi.fn(async () => undefined),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
}));
vi.mock('@/lib/managed-compute-gate', () => ({
  buildManagedComputeGateResponse: vi.fn(() => null),
  buildOrganizationPolicyGateResponse: vi.fn(async () => null),
  buildModelPolicyGateResponse: vi.fn(async () => null),
  buildSpendLimitGateResponse: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@shared/utils/env', () => ({
  requireEnv: (...args: unknown[]) => mocks.requireEnv(...args),
  getOptionalEnv: vi.fn(() => undefined),
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mocks.userScopedDb(...args),
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  resolveEntitlementBundle: (...args: unknown[]) => mocks.entitlement(...args),
}));
vi.mock('@/lib/services/managed-compute-access', () => ({
  evaluateManagedComputeSubscriptionAccess: vi.fn(async () => ({ allowed: true })),
  buildManagedComputeAccessGateResponse: vi.fn(() => null),
}));
vi.mock('@/lib/services/tier-unit-quota-service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    assertTierUnitAllowance: (...args: unknown[]) => mocks.assertTierUnitAllowance(...args),
  };
});
vi.mock('@/lib/voice/live-voice-tools', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveLiveVoiceFunctionTools: vi.fn(async () => ({ tools: [], names: [] })),
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    reserveManagedUsageRequest: (...args: unknown[]) => mocks.reserve(...args),
    finalizeManagedUsageRequest: (...args: unknown[]) => mocks.finalize(...args),
    markManagedUsageProviderStarted: (...args: unknown[]) => mocks.providerStarted(...args),
    markManagedUsageClientDelivered: (...args: unknown[]) => mocks.clientDelivered(...args),
  };
});

const { POST } = await import('./route');
const { LIVE_SESSION_CEILING_SECONDS } = await import('@/lib/voice/live-voice-billing');
const { ManagedUsageRequestError } = await import('@/lib/services/managed-usage-request-service');

async function errorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
}

const OFFER = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n';
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const MINUTES_RESET_AT = '2026-11-01T00:00:00.000Z';

function sessionDb(overrides: { insertedId?: string | null } = {}) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('to_regclass')) return [{ ready: true }];
      if (sql.includes('insert into public.voice_sessions')) {
        return overrides.insertedId === null ? [] : [{ id: overrides.insertedId ?? 'vs_1' }];
      }
      return [];
    }),
  };
}

function withSessionStore(overrides: { insertedId?: string | null } = {}): void {
  mocks.userScopedDb.mockResolvedValue({
    db: sessionDb(overrides),
    userId: 'user-1',
    organizationId: null,
  });
}

function minutesLeft(hardLimit: number | null, consumed: number): void {
  mocks.assertTierUnitAllowance.mockResolvedValue({
    unit: 'voice_minutes',
    hardLimit,
    softLimit: null,
    consumed,
    requested: 1,
    softLimitReached: false,
  });
}

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/voice/live/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/voice/live/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.requireEnv.mockReturnValue('sk-test-openai-key');
    withSessionStore();
    mocks.entitlement.mockResolvedValue({ plan: 'pro', catalogVersion: null, subscription: null });
    minutesLeft(300, 0);
    mocks.keepsOutOfTraining.mockReturnValue(null);
  });

  it('creates the session server-side with the live model, webrtc transport and delegation', async () => {
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ session: { id: 'live_1' }, transport: { type: 'webrtc', sdp: 'answer' } }),
        { status: 201 },
      ),
    );

    const response = await POST(
      request({ sdp: OFFER, voice: 'quartz', conversationId: CONVERSATION_ID }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      sessionId: string;
      sdp: string;
      settlement: Record<string, unknown>;
    };
    expect(body.sessionId).toBe('live_1');
    expect(body.sdp).toBe('answer');
    expect(body.settlement).toEqual({ ceilingSeconds: LIVE_SESSION_CEILING_SECONDS });
    expect(mocks.assertTierUnitAllowance).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', planTier: 'pro', unit: 'voice_minutes' }),
    );
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();

    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/live/sessions');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer sk-test-openai-key',
    );
    const sent = JSON.parse(String(init.body)) as {
      session: {
        model: string;
        audio: { output: { voice: string } };
        delegation: { type: string; responses: { model: string; tools: { type: string }[] } };
      };
      transport: { type: string; sdp: string };
    };
    expect(sent.session.model).toBe(LIVE_MODEL.apiModelId ?? LIVE_MODEL.id);
    expect(sent.session.audio.output.voice).toBe('quartz');
    expect(sent.session.delegation.type).toBe('responses');
    expect(sent.session.delegation.responses.model).toBe(
      BACKEND_MODEL.apiModelId ?? BACKEND_MODEL.id,
    );
    // Tied to the resolver, not to a copy of its answer: the delegated turn runs
    // inside the provider, so a tool shape written out here would drift from the
    // one the chat path sends and take the whole session down with it.
    expect(sent.session.delegation.responses.tools).toEqual(
      resolveLiveVoiceDelegationTools(BACKEND_MODEL, WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY)
        .tools,
    );
    expect(sent.session.delegation.responses.tools.length).toBeGreaterThan(0);
    expect(sent.transport).toEqual({ type: 'webrtc', sdp: OFFER });
    expect(mocks.assertTierUnitAllowance).toHaveBeenCalledWith(
      expect.objectContaining({ unit: 'voice_minutes', requestedUnits: 1 }),
    );
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('sets the backend reasoning by plan and keeps session.update off the browser data channel', async () => {
    mocks.fetch.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            session: { id: 'live_r' },
            transport: { type: 'webrtc', sdp: 'answer' },
          }),
          { status: 201 },
        ),
    );

    const paid = await POST(
      request({ sdp: OFFER, conversationId: CONVERSATION_ID, reasoning: 'thinking' }),
    );
    expect(((await paid.json()) as { settings: { reasoning: string } }).settings.reasoning).toBe(
      'thinking',
    );
    mocks.entitlement.mockResolvedValue({ plan: 'free', catalogVersion: null, subscription: null });
    minutesLeft(30, 0);
    const free = await POST(
      request({ sdp: OFFER, conversationId: CONVERSATION_ID, reasoning: 'thinking' }),
    );
    expect(((await free.json()) as { settings: { reasoning: string } }).settings.reasoning).toBe(
      'instant',
    );

    const sent = mocks.fetch.mock.calls.map(
      (call) =>
        JSON.parse(String((call as [string, RequestInit])[1].body)) as {
          session: {
            delegation: { responses: { reasoning?: { effort: string } } };
            client: { data_channel: { allowed_client_events: string[] } };
          };
        },
    );
    const [paidEffort, freeEffort] = sent.map(
      (body) => body.session.delegation.responses.reasoning?.effort,
    );
    expect(paidEffort).toBeDefined();
    expect(freeEffort).toBeDefined();
    expect(paidEffort).not.toBe(freeEffort);
    for (const body of sent) {
      const allowed = body.session.client.data_channel.allowed_client_events;
      expect(allowed).not.toContain('session.update');
      expect(allowed).toEqual(
        expect.arrayContaining([
          'session.close',
          'response.item.create',
          'session.commentary.append',
        ]),
      );
    }
  });

  it('starts a Free session on voice minutes alone, with no managed budget and no spend window', async () => {
    mocks.entitlement.mockResolvedValue({ plan: 'free', catalogVersion: null, subscription: null });
    minutesLeft(30, 0);
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ session: { id: 'live_f' }, transport: { type: 'webrtc', sdp: 'answer' } }),
        { status: 201 },
      ),
    );

    const response = await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));

    expect(response.status).toBe(201);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('refuses at zero minutes with the reset date and a way back to text', async () => {
    const refusal = new ManagedUsageRequestError(
      'used up',
      429,
      'voice_minutes_monthly_limit_reached',
    );
    refusal.limitContext = { resetsAt: MINUTES_RESET_AT, alternativeModel: null };
    mocks.assertTierUnitAllowance.mockRejectedValue(refusal);

    const response = await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));

    expect(response.status).toBe(429);
    const body = (await response.json()) as {
      error: { code: string; message: string; resets_at: string };
    };
    expect(body.error.code).toBe('voice_minutes_monthly_limit_reached');
    expect(body.error.resets_at).toBe(MINUTES_RESET_AT);
    expect(body.error.message).toContain('They reset on November 1.');
    expect(body.error.message).toContain('Continue in text');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('delegates a free plan session to the free backend slot rather than the paid one', async () => {
    mocks.entitlement.mockResolvedValue({ plan: 'free', catalogVersion: null, subscription: null });
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          session: { id: 'live_free' },
          transport: { type: 'webrtc', sdp: 'answer' },
        }),
        { status: 201 },
      ),
    );

    const response = await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));

    expect(response.status).toBe(201);
    const freeBackend = getModelMetadataById(getRoutingSlotModel('voice_live_backend_free'))!;
    const sent = JSON.parse(
      String((mocks.fetch.mock.calls[0] as [string, RequestInit])[1].body),
    ) as { session: { delegation: { responses: { model: string } } } };
    expect(sent.session.delegation.responses.model).toBe(freeBackend.apiModelId ?? freeBackend.id);
    expect(sent.session.delegation.responses.model).not.toBe(
      BACKEND_MODEL.apiModelId ?? BACKEND_MODEL.id,
    );
  });

  it('applies the requested pace and language and records the session against the conversation', async () => {
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ session: { id: 'live_2' }, transport: { type: 'webrtc', sdp: 'answer' } }),
        { status: 201 },
      ),
    );
    const rows: Array<[string, unknown[]]> = [];
    mocks.userScopedDb.mockResolvedValue({
      db: {
        query: async (sql: string, params: unknown[] = []) => {
          rows.push([sql, params]);
          if (sql.includes('to_regclass')) return [{ ready: true }];
          if (sql.includes('insert into public.voice_sessions')) return [{ id: 'vs_1' }];
          return [];
        },
      },
      userId: 'user-1',
      organizationId: null,
    });

    const response = await POST(
      request({
        sdp: OFFER,
        voice: 'quartz',
        conversationId: 'conv-1',
        language: 'es',
        pace: 1.25,
      }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      settings: { voice: string; language: string | null; pace: number };
    };
    expect(body.settings).toEqual({
      voice: 'quartz',
      language: 'es',
      pace: 1.25,
      reasoning: 'instant',
    });

    const sent = JSON.parse(
      String((mocks.fetch.mock.calls[0] as [string, RequestInit])[1].body),
    ) as {
      session: {
        instructions: string;
        audio: Record<string, unknown>;
      };
    };
    expect(sent.session.audio).toEqual({ output: { voice: 'quartz' } });
    expect(sent.session.instructions).toContain('Speak and transcribe in es.');
    expect(sent.session.instructions).toContain(
      'Speak at about 1.25 times your natural speaking pace.',
    );

    const insert = rows.find(([sql]) => sql.includes('insert into public.voice_sessions'));
    expect(insert?.[1]).toEqual(
      expect.arrayContaining(['user-1', 'conv-1', 'live_2', 'web', 'quartz', 'es', 1.25]),
    );
    // The tools the delegation was offered are what a later audit reads back,
    // so the record carries the resolver's answer rather than an empty list.
    const offeredTools = describeDelegationTools(
      resolveLiveVoiceDelegationTools(BACKEND_MODEL, WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY)
        .tools,
    );
    expect(offeredTools.length).toBeGreaterThan(0);
    expect(JSON.parse(String(insert?.[1]?.[10]))).toEqual(offeredTools);
  });

  it('refuses a session the store could not record and charges nothing for it', async () => {
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ session: { id: 'live_3' }, transport: { type: 'webrtc', sdp: 'answer' } }),
        { status: 201 },
      ),
    );
    mocks.userScopedDb.mockResolvedValue({
      db: {
        query: async (sql: string) => {
          if (sql.includes('to_regclass')) return [{ ready: true }];
          if (sql.includes('insert into public.voice_sessions')) return [];
          return [];
        },
      },
      userId: 'user-1',
      organizationId: null,
    });

    const response = await POST(request({ sdp: OFFER, conversationId: 'conv-1' }));

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('voice_session_not_recorded');
    expect(body.error.message).toContain('no voice minutes were used');
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('sizes the first block to the voice minutes the plan has left', async () => {
    minutesLeft(300, 296);
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ session: { id: 'live_4' }, transport: { type: 'webrtc', sdp: 'answer' } }),
        { status: 201 },
      ),
    );

    const response = await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));

    expect(response.status).toBe(201);
    const body = (await response.json()) as { settlement: { ceilingSeconds: number } };
    expect(body.settlement.ceilingSeconds).toBe(240);
  });

  it('gives an unlimited plan a whole block', async () => {
    mocks.entitlement.mockResolvedValue({ plan: 'max', catalogVersion: null, subscription: null });
    minutesLeft(null, 0);
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ session: { id: 'live_m' }, transport: { type: 'webrtc', sdp: 'answer' } }),
        { status: 201 },
      ),
    );

    const body = (await (
      await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }))
    ).json()) as { settlement: { ceilingSeconds: number } };

    expect(body.settlement.ceilingSeconds).toBe(LIVE_SESSION_CEILING_SECONDS);
  });

  it('answers 503 billing_unavailable when the voice minutes cannot be read', async () => {
    mocks.assertTierUnitAllowance.mockRejectedValue(new Error('database unreachable'));

    const response = await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));

    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe('billing_unavailable');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  describe('in a chat that holds Google user data', () => {
    function googleDb(evidence: 'marked' | 'history') {
      const query = vi.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('to_regclass')) return [{ ready: true }];
        if (sql.includes('google_user_data_at is not null as marked')) {
          return [{ marked: evidence === 'marked', project_id: null }];
        }
        if (sql.includes('from public.web_messages m')) {
          return [{ metadata: { tools: [{ name: 'mcp__gmail__search_threads' }] } }];
        }
        return [];
      });
      mocks.userScopedDb.mockResolvedValue({
        db: { query },
        userId: 'user-1',
        organizationId: null,
      });
      return query;
    }

    it.each(['marked', 'history'] as const)(
      'refuses to start when the voice models may train (%s) and reserves nothing',
      async (evidence) => {
        mocks.keepsOutOfTraining.mockReturnValue(false);
        const query = googleDb(evidence);

        const response = await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));

        expect(response.status).toBe(403);
        expect(await errorCode(response)).toBe('model_may_train');
        expect(mocks.reserve).not.toHaveBeenCalled();
        expect(mocks.fetch).not.toHaveBeenCalled();
        if (evidence === 'history') {
          expect(
            query.mock.calls.some(([sql]) => sql.includes('set google_user_data_at = now()')),
          ).toBe(true);
        }
      },
    );

    it('starts when both voice models keep inputs out of training', async () => {
      mocks.keepsOutOfTraining.mockReturnValue(true);
      googleDb('marked');

      const response = await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));

      expect(response.status).not.toBe(403);
      expect(mocks.assertTierUnitAllowance).toHaveBeenCalled();
    });
  });

  it('needs a conversation to record the session in before anything is reserved', async () => {
    const response = await POST(request({ sdp: OFFER }));

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('voice_conversation_required');
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('starts nothing and reserves nothing when the session store is not ready', async () => {
    mocks.userScopedDb.mockResolvedValue({
      db: { query: vi.fn(async () => [{ ready: false }]) },
      userId: 'user-1',
      organizationId: null,
    });

    const response = await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));

    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe('voice_session_not_recorded');
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('answers 503 with a configuration code when the provider key is missing', async () => {
    mocks.requireEnv.mockImplementation(() => {
      throw new Error('FATAL: OPENAI_API_KEY environment variable is required but not set.');
    });

    const response = await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('live_voice_not_configured');
    expect(body.error.message).toContain('OPENAI_API_KEY');
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('surfaces a provider access refusal and opens no voice session record', async () => {
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'model_not_found',
            message: 'The model does not exist',
            type: 'invalid_request_error',
          },
        }),
        { status: 404 },
      ),
    );

    const response = await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));
    expect(response.status).toBe(403);
    const body = (await response.json()) as {
      error: { code: string; upstreamCode: string; upstreamStatus: number };
    };
    expect(body.error.code).toBe('live_voice_access_denied');
    expect(body.error.upstreamCode).toBe('model_not_found');
    expect(body.error.upstreamStatus).toBe(404);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('carries the conversation the call continues into both instruction slots', async () => {
    const conversationId = '11111111-1111-4111-8111-111111111111';
    mocks.userScopedDb.mockResolvedValue({
      db: {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('to_regclass')) return [{ ready: true }];
          if (sql.includes('insert into public.voice_sessions')) return [{ id: 'vs_2' }];
          if (sql.includes('from web_conversations')) {
            return [
              {
                id: conversationId,
                project_id: null,
                is_temporary: false,
                active_leaf_message_id: null,
              },
            ];
          }
          if (sql.includes('from web_messages')) {
            return [
              { role: 'assistant', content: 'The rollout lands on Thursday.' },
              { role: 'user', content: 'When does the rollout land?' },
            ];
          }
          return [];
        }),
      },
      userId: 'user-1',
      organizationId: null,
    });
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ session: { id: 'live_2' }, transport: { type: 'webrtc', sdp: 'answer' } }),
        { status: 201 },
      ),
    );

    const response = await POST(request({ sdp: OFFER, conversationId }));
    expect(response.status).toBe(201);

    const [, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(String(init.body)) as {
      session: { instructions: string; delegation: { responses: { instructions: string } } };
    };
    expect(sent.session.instructions).toContain('When does the rollout land?');
    expect(sent.session.instructions).toContain('The rollout lands on Thursday.');
    expect(sent.session.delegation.responses.instructions).toContain('When does the rollout land?');
  });

  it('starts the session without prior context when the context read fails', async () => {
    mocks.userScopedDb.mockResolvedValue({
      db: {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('to_regclass')) return [{ ready: true }];
          if (sql.includes('insert into public.voice_sessions')) return [{ id: 'vs_3' }];
          if (sql.includes('public.voice_sessions')) return [];
          throw new Error('context read failed');
        }),
      },
      userId: 'user-1',
      organizationId: null,
    });
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ session: { id: 'live_3' }, transport: { type: 'webrtc', sdp: 'answer' } }),
        { status: 201 },
      ),
    );

    const response = await POST(
      request({ sdp: OFFER, conversationId: '11111111-1111-4111-8111-111111111111' }),
    );
    expect(response.status).toBe(201);
    const [, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(String(init.body)) as { session: { instructions: string } };
    expect(sent.session.instructions).not.toContain('conversation_so_far');
  });

  it('rejects a body without an offer before any reservation', async () => {
    const response = await POST(request({ voice: 'marin', conversationId: CONVERSATION_ID }));
    expect(response.status).toBe(400);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
});
