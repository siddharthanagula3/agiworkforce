// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getModelMetadataById, getRoutingSlotModel } from '@agiworkforce/types';
import {
  describeDelegationTools,
  resolveLiveVoiceDelegationTools,
} from '@/lib/voice/live-voice-tools';
import { WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY } from '@shared/types/toolApprovalPolicy';

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
  const actual = await importOriginal<typeof import('@/lib/server/provider-training-opt-out')>();
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
  ...(await importOriginal<typeof import('@/lib/services/entitlement-resolution')>()),
  resolveEntitlementBundle: (...args: unknown[]) => mocks.entitlement(...args),
}));
vi.mock('./lib/voice-session-budget', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/voice-session-budget')>()),
  planVoiceSessionBlock: (...args: unknown[]) => mocks.planBlock(...args),
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
const {
  LIVE_SESSION_BLOCK_MINUTES,
  LIVE_SESSION_CEILING_SECONDS,
  LIVE_SESSION_MIN_BLOCK_SECONDS,
  liveSessionChargeMicrousd,
} = await import('@/lib/voice/live-voice-billing');
const { ManagedUsageRequestError } = await import('@/lib/services/managed-usage-request-service');

function charge(seconds: number): number {
  return liveSessionChargeMicrousd(seconds, LIVE_MODEL.id) as number;
}

interface ManagedUsageReservationCall {
  idempotencyKey: string;
  requestHash: string;
}

async function errorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
}

const OFFER = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n';
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const RESERVATION = {
  db: {},
  userId: 'user-1',
  idempotencyKey: 'agi.voice.live.test',
  requestHash: 'hash',
  leaseToken: 'lease',
  estimatedCostMicrousd: charge(LIVE_SESSION_CEILING_SECONDS),
  estimatedCostCents: 0,
};
const FIVE_HOUR_RESET = '2026-09-27T20:00:00.000Z';

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

function fullBlock(): void {
  mocks.planBlock.mockResolvedValue({
    blockSeconds: LIVE_SESSION_CEILING_SECONDS,
    resetsAt: { rolling_five_hour_limit_reached: FIVE_HOUR_RESET },
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
    fullBlock();
    mocks.assertTierUnitAllowance.mockResolvedValue(undefined);
    mocks.reserve.mockResolvedValue(RESERVATION);
    mocks.finalize.mockResolvedValue({});
    mocks.providerStarted.mockResolvedValue(undefined);
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
      settlement: { idempotencyKey: string; ceilingSeconds: number };
    };
    expect(body.sessionId).toBe('live_1');
    expect(body.sdp).toBe('answer');
    expect(body.settlement.idempotencyKey).toBe(RESERVATION.idempotencyKey);
    expect(body.settlement.ceilingSeconds).toBe(LIVE_SESSION_CEILING_SECONDS);
    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        estimatedCostMicrousd: charge(LIVE_SESSION_CEILING_SECONDS),
        planTier: 'pro',
        isFlagship: false,
        quotaFeature: 'voice_live',
      }),
    );

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
      expect.objectContaining({
        unit: 'voice_minutes',
        requestedUnits: LIVE_SESSION_BLOCK_MINUTES,
      }),
    );
    expect(mocks.finalize).not.toHaveBeenCalled();
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
    expect(body.settings).toEqual({ voice: 'quartz', language: 'es', pace: 1.25 });

    const sent = JSON.parse(
      String((mocks.fetch.mock.calls[0] as [string, RequestInit])[1].body),
    ) as {
      session: {
        instructions: string;
        audio: {
          output: { voice: string; speed: number };
          input: { transcription: { language: string } };
        };
      };
    };
    expect(sent.session.audio.output.speed).toBe(1.25);
    expect(sent.session.audio.input.transcription.language).toBe('es');
    expect(sent.session.instructions).toContain('es');

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
    expect(body.error.message).toContain('nothing was charged');
    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed', actualCostMicrousd: 0 }),
    );
  });

  it('sizes the block to what the plan windows still cover', async () => {
    mocks.planBlock.mockResolvedValue({ blockSeconds: 240, resetsAt: {} });
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
    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedCostMicrousd: charge(240) }),
    );
    expect(mocks.assertTierUnitAllowance).toHaveBeenCalledWith(
      expect.objectContaining({ unit: 'voice_minutes', requestedUnits: 4 }),
    );
    expect(mocks.planBlock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', planTier: 'pro', modelId: LIVE_MODEL.id }),
    );
  });

  it('asks the ledger for at least a minute, so an empty window is refused by the ledger', async () => {
    mocks.planBlock.mockResolvedValue({
      blockSeconds: 0,
      resetsAt: { rolling_five_hour_limit_reached: FIVE_HOUR_RESET },
    });
    mocks.reserve.mockRejectedValue(
      new ManagedUsageRequestError('limit', 429, 'rolling_five_hour_limit_reached'),
    );

    const response = await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));

    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedCostMicrousd: charge(LIVE_SESSION_MIN_BLOCK_SECONDS) }),
    );
    expect(response.status).toBe(429);
    const body = (await response.json()) as { error: { code: string; resets_at?: string } };
    expect(body.error.code).toBe('rolling_five_hour_limit_reached');
    expect(body.error.resets_at).toBe(FIVE_HOUR_RESET);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('refuses a session past its voice minute allowance before any hold', async () => {
    mocks.assertTierUnitAllowance.mockRejectedValue(
      new ManagedUsageRequestError('minutes', 402, 'voice_minutes_exhausted'),
    );

    const response = await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));

    expect(response.status).toBe(402);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('answers 503 billing_unavailable when the reservation fails for another reason', async () => {
    mocks.reserve.mockRejectedValue(new Error('ledger unreachable'));

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
      expect(mocks.reserve).toHaveBeenCalled();
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

  it('surfaces a provider access refusal and releases the reservation', async () => {
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
    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed', actualCostMicrousd: 0 }),
    );
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

describe('POST /api/voice/live/sessions replayed', () => {
  const SECOND_OFFER = 'v=0\r\no=- 2 1 IN IP4 127.0.0.1\r\n';
  let ledger: Map<string, { requestHash: string; settled: boolean }>;

  function requestWithKey(body: unknown, idempotencyKey?: string): NextRequest {
    return new NextRequest('http://localhost/api/voice/live/sessions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      body: JSON.stringify({ conversationId: CONVERSATION_ID, ...(body as object) }),
    });
  }

  function sessionAccepted(id: string): Response {
    return new Response(
      JSON.stringify({ session: { id }, transport: { type: 'webrtc', sdp: 'answer' } }),
      { status: 201 },
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    ledger = new Map();
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.requireEnv.mockReturnValue('sk-test-openai-key');
    withSessionStore();
    mocks.entitlement.mockResolvedValue({ plan: 'pro', catalogVersion: null, subscription: null });
    fullBlock();
    mocks.assertTierUnitAllowance.mockResolvedValue(undefined);
    mocks.providerStarted.mockResolvedValue(undefined);
    mocks.fetch.mockImplementation(async () => sessionAccepted(`live_${ledger.size}`));

    // What the ledger does with a key it has already seen: a different request
    // body is a conflict, a live hold is in progress, and a hold that reached a
    // terminal state is a replay. None of them opens a second hold.
    mocks.reserve.mockImplementation(async (input: ManagedUsageReservationCall) => {
      const held = ledger.get(input.idempotencyKey);
      if (held) {
        if (held.requestHash !== input.requestHash) {
          throw new ManagedUsageRequestError('different body', 409, 'idempotency_conflict');
        }
        throw new ManagedUsageRequestError(
          'already held',
          409,
          held.settled ? 'idempotency_replay' : 'idempotency_in_progress',
        );
      }
      ledger.set(input.idempotencyKey, { requestHash: input.requestHash, settled: false });
      return {
        ...RESERVATION,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
      };
    });
    mocks.finalize.mockImplementation(async (input: ManagedUsageReservationCall) => {
      const held = ledger.get(input.idempotencyKey);
      if (held) held.settled = true;
      return {};
    });
  });

  it('holds one live session once when the same offer is sent twice', async () => {
    const first = await POST(
      request({ sdp: OFFER, voice: 'quartz', conversationId: CONVERSATION_ID }),
    );
    const second = await POST(
      request({ sdp: OFFER, voice: 'quartz', conversationId: CONVERSATION_ID }),
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(await errorCode(second)).toBe('idempotency_in_progress');
    expect(ledger.size).toBe(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('derives the same key from the same offer and a different key from a new one', async () => {
    await POST(request({ sdp: OFFER, voice: 'quartz', conversationId: CONVERSATION_ID }));
    await POST(request({ sdp: OFFER, voice: 'quartz', conversationId: CONVERSATION_ID }));
    const keys = mocks.reserve.mock.calls.map(
      (call) => (call[0] as ManagedUsageReservationCall).idempotencyKey,
    );

    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toMatch(/^agi\.voice\.live\.[0-9a-f]{48}$/);
  });

  it('opens a second hold for a session the user deliberately starts', async () => {
    const first = await POST(
      request({ sdp: OFFER, voice: 'quartz', conversationId: CONVERSATION_ID }),
    );
    const second = await POST(
      request({ sdp: SECOND_OFFER, voice: 'quartz', conversationId: CONVERSATION_ID }),
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(ledger.size).toBe(2);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('refuses a retry of an attempt that already settled rather than charging again', async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'server_error' } }), { status: 500 }),
    );
    const failed = await POST(
      request({ sdp: OFFER, voice: 'quartz', conversationId: CONVERSATION_ID }),
    );

    expect(failed.status).not.toBe(201);
    expect(mocks.finalize).toHaveBeenCalledTimes(1);

    const retry = await POST(
      request({ sdp: OFFER, voice: 'quartz', conversationId: CONVERSATION_ID }),
    );

    expect(retry.status).toBe(409);
    expect(await errorCode(retry)).toBe('idempotency_replay');
    expect(ledger.size).toBe(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('takes the client at its word when it supplies its own key', async () => {
    const first = await POST(requestWithKey({ sdp: OFFER }, 'client-key-0001'));
    const second = await POST(requestWithKey({ sdp: SECOND_OFFER }, 'client-key-0001'));

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(await errorCode(second)).toBe('idempotency_conflict');
    expect(ledger.size).toBe(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('gives two client keys two holds for the same offer', async () => {
    await POST(requestWithKey({ sdp: OFFER }, 'client-key-0001'));
    await POST(requestWithKey({ sdp: OFFER }, 'client-key-0002'));

    expect(ledger.size).toBe(2);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('refuses a malformed client key before any hold is opened', async () => {
    const response = await POST(requestWithKey({ sdp: OFFER }, 'short'));

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('invalid_idempotency_key');
    expect(ledger.size).toBe(0);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
