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
type ScanModule2 = typeof import('./lib/voice-session-budget');
type ScanModule3 = typeof import('@/lib/voice/free-voice-allowance');
type ScanModule4 = typeof import('./lib/voice-session-settlement');

const LIVE_MODEL = getModelMetadataById(getRoutingSlotModel('voice_live'))!;
const BACKEND_MODEL = getModelMetadataById(getRoutingSlotModel('voice_live_backend'))!;

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  finalize: vi.fn(),
  providerStarted: vi.fn(),
  clientDelivered: vi.fn(),
  entitlement: vi.fn(),
  assess: vi.fn(),
  userScopedDb: vi.fn(),
  fetch: vi.fn(),
  assertTierUnitAllowance: vi.fn(),
  freeAllowanceSeconds: vi.fn<(planTier: string | null) => number | null>(() => null),
  grantFree: vi.fn(),
  sweep: vi.fn(),
  settleFree: vi.fn(),
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
vi.mock('./lib/voice-session-budget', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  assessVoiceBudget: (...args: unknown[]) => mocks.assess(...args),
}));
vi.mock('@/lib/voice/free-voice-allowance', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  freeVoiceAllowanceSeconds: (planTier: string | null) => mocks.freeAllowanceSeconds(planTier),
  grantFreeVoiceSeconds: (...args: unknown[]) => mocks.grantFree(...args),
  settleFreeVoiceSeconds: (...args: unknown[]) => mocks.settleFree(...args),
}));
vi.mock('./lib/voice-session-settlement', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  settleAbandonedVoiceSessions: (...args: unknown[]) => mocks.sweep(...args),
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
const { LIVE_VOICE_BLOCK_SECONDS, LIVE_VOICE_LEASE_SECONDS, liveVoiceBlockChargeMicrousd } =
  await import('@/lib/voice/live-voice-billing');
const { voiceReservationIdentity } = await import('./lib/voice-session-budget');
const { ManagedUsageRequestError } = await import('@/lib/services/managed-usage-request-service');

async function errorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
}

const OFFER = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n';
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const FIVE_HOUR_RESET = '2026-10-10T15:00:00.000Z';
const ALLOWANCE_RESET = '2026-11-01T00:00:00.000Z';
const FREE_ALLOWANCE_SECONDS = 600;
const PAID_BLOCK = liveVoiceBlockChargeMicrousd(LIVE_MODEL.id, BACKEND_MODEL.id)!;

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

function budget(planFundsBlock = true): void {
  mocks.assess.mockResolvedValue({
    planFundsBlock,
    resetsAt: { rolling_five_hour_limit_reached: FIVE_HOUR_RESET },
  });
}

function reservedCalls(): Array<Record<string, unknown>> {
  return mocks.reserve.mock.calls.map((call) => call[0] as Record<string, unknown>);
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
    budget();
    mocks.reserve.mockImplementation(async (input: Record<string, unknown>) => ({
      ...input,
      estimatedCostCents: 0,
    }));
    mocks.finalize.mockResolvedValue({});
    mocks.providerStarted.mockResolvedValue(undefined);
    mocks.keepsOutOfTraining.mockReturnValue(null);
    mocks.freeAllowanceSeconds.mockReturnValue(null);
    mocks.grantFree.mockResolvedValue({ granted: true, grantedSeconds: 60, fresh: true });
    mocks.settleFree.mockResolvedValue(0);
    mocks.sweep.mockResolvedValue(0);
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
    expect(body.settlement).toEqual({ ceilingSeconds: LIVE_VOICE_BLOCK_SECONDS });
    const [reserved] = reservedCalls();
    expect(reserved).toMatchObject({
      userId: 'user-1',
      model: LIVE_MODEL.id,
      estimatedCostMicrousd: PAID_BLOCK,
      leaseSeconds: LIVE_VOICE_LEASE_SECONDS,
      planTier: 'pro',
      isFlagship: false,
      quotaFeature: 'voice_live',
      conversationId: CONVERSATION_ID,
    });
    const insert = (
      (await mocks.userScopedDb.mock.results[0]!.value) as {
        db: { query: { mock: { calls: [string, unknown[]][] } } };
      }
    ).db.query.mock.calls.find(([sql]) => sql.includes('insert into public.voice_sessions'));
    expect(reserved).toMatchObject(voiceReservationIdentity(String(insert?.[1]?.[11])));
    expect(mocks.providerStarted).toHaveBeenCalledTimes(1);
    expect(mocks.grantFree).not.toHaveBeenCalled();
    expect(mocks.sweep).toHaveBeenCalledTimes(1);
    expect(mocks.reserve.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.sweep.mock.invocationCallOrder[0]!,
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
    mocks.freeAllowanceSeconds.mockReturnValue(FREE_ALLOWANCE_SECONDS);
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

  describe('on the Free monthly voice allowance', () => {
    beforeEach(() => {
      mocks.entitlement.mockResolvedValue({
        plan: 'free',
        catalogVersion: null,
        subscription: null,
      });
      mocks.freeAllowanceSeconds.mockReturnValue(FREE_ALLOWANCE_SECONDS);
    });

    function providerAnswers(id: string): void {
      mocks.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({ session: { id }, transport: { type: 'webrtc', sdp: 'answer' } }),
          { status: 201 },
        ),
      );
    }

    it('grants the first minute to the recorded session and touches no usage ledger', async () => {
      providerAnswers('live_f');

      const response = await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));

      expect(response.status).toBe(201);
      expect(((await response.json()) as { settlement: unknown }).settlement).toEqual({
        ceilingSeconds: LIVE_VOICE_BLOCK_SECONDS,
      });
      expect(mocks.freeAllowanceSeconds).toHaveBeenCalledWith('free');
      const scoped = (await mocks.userScopedDb.mock.results[0]!.value) as {
        db: { query: { mock: { calls: [string, unknown[]][] } } };
      };
      const insert = scoped.db.query.mock.calls.find(([sql]) =>
        sql.includes('insert into public.voice_sessions'),
      );
      expect(mocks.grantFree).toHaveBeenCalledTimes(1);
      expect(mocks.grantFree).toHaveBeenCalledWith({
        db: scoped.db,
        userId: 'user-1',
        sessionId: String(insert?.[1]?.[11]),
        use: 'live',
        grantKey: 'provider:1',
        seconds: LIVE_VOICE_BLOCK_SECONDS,
        limitSeconds: FREE_ALLOWANCE_SECONDS,
      });
      expect(mocks.assess).not.toHaveBeenCalled();
      expect(mocks.reserve).not.toHaveBeenCalled();
      expect(mocks.providerStarted).not.toHaveBeenCalled();
      expect(mocks.finalize).not.toHaveBeenCalled();
      expect(mocks.settleFree).not.toHaveBeenCalled();
    });

    it('settles abandoned calls before the allowance is read, as the owner on the plan backend', async () => {
      providerAnswers('live_s');

      await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));

      expect(mocks.sweep.mock.invocationCallOrder[0]!).toBeLessThan(
        mocks.grantFree.mock.invocationCallOrder[0]!,
      );
      const sweep = mocks.sweep.mock.calls[0]![0] as {
        userId: string;
        backendModelFor: () => Promise<string>;
      };
      expect(sweep.userId).toBe('user-1');
      expect(await sweep.backendModelFor()).toBe(getRoutingSlotModel('voice_live_backend_free'));
    });

    it('still grants when the sweep of abandoned calls fails', async () => {
      providerAnswers('live_s2');
      mocks.sweep.mockRejectedValue(new Error('sweep failed'));

      const response = await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));

      expect(response.status).toBe(201);
      expect(mocks.grantFree).toHaveBeenCalledTimes(1);
    });

    it('refuses with the month reset once the allowance is used and calls no provider', async () => {
      mocks.grantFree.mockResolvedValue({
        granted: false,
        reason: 'allowance_used',
        resetsAt: ALLOWANCE_RESET,
      });

      const response = await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));

      expect(response.status).toBe(429);
      const body = (await response.json()) as { error: { code: string; resets_at: string } };
      expect(body.error.code).toBe('voice_minutes_monthly_limit_reached');
      expect(body.error.resets_at).toBe(ALLOWANCE_RESET);
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.reserve).not.toHaveBeenCalled();
      expect(mocks.assess).not.toHaveBeenCalled();
    });

    it('settles the grant at zero seconds and finalizes nothing when the provider refuses', async () => {
      mocks.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'model_not_found', message: 'The model does not exist' },
          }),
          { status: 404 },
        ),
      );

      const response = await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));

      expect(response.status).toBe(403);
      expect(mocks.settleFree).toHaveBeenCalledTimes(1);
      expect(mocks.settleFree).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', usedSeconds: 0 }),
      );
      expect(mocks.finalize).not.toHaveBeenCalled();
      expect(mocks.providerStarted).not.toHaveBeenCalled();
    });

    it('settles the grant at zero seconds when the store could not record the session', async () => {
      providerAnswers('live_3');
      mocks.userScopedDb.mockResolvedValue({
        db: {
          query: async (sql: string) => {
            if (sql.includes('to_regclass')) return [{ ready: true }];
            return [];
          },
        },
        userId: 'user-1',
        organizationId: null,
      });

      const response = await POST(request({ sdp: OFFER, conversationId: 'conv-1' }));

      expect(response.status).toBe(503);
      expect(mocks.settleFree).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', usedSeconds: 0 }),
      );
      expect(mocks.finalize).not.toHaveBeenCalled();
    });

    it('answers 503 billing_unavailable when the grant cannot be written', async () => {
      mocks.grantFree.mockRejectedValue(new Error('usage store down'));

      const response = await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));

      expect(response.status).toBe(503);
      expect(await errorCode(response)).toBe('billing_unavailable');
      expect(mocks.fetch).not.toHaveBeenCalled();
    });
  });

  it('refuses a plan whose budget cannot fund a single block in plain words', async () => {
    budget(false);

    const response = await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));

    expect(response.status).toBe(402);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('voice_usage_not_in_plan');
    expect(body.error.message).toMatch(/continue in text/);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('refuses with the binding window and its reset when the shared budget is spent', async () => {
    mocks.reserve.mockRejectedValue(
      new ManagedUsageRequestError(
        'Your rolling 5-hour usage limit is reached.',
        429,
        'rolling_five_hour_limit_reached',
      ),
    );

    const response = await POST(request({ sdp: OFFER, conversationId: CONVERSATION_ID }));

    expect(response.status).toBe(429);
    const body = (await response.json()) as { error: { code: string; resets_at: string } };
    expect(body.error.code).toBe('rolling_five_hour_limit_reached');
    expect(body.error.resets_at).toBe(FIVE_HOUR_RESET);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('delegates a free plan session to the free backend slot rather than the paid one', async () => {
    mocks.entitlement.mockResolvedValue({ plan: 'free', catalogVersion: null, subscription: null });
    mocks.freeAllowanceSeconds.mockReturnValue(FREE_ALLOWANCE_SECONDS);
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
    expect(body.error.message).toContain('nothing was charged');
    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed', actualCostMicrousd: 0 }),
    );
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

  it('keeps saved memories out of a call whose chat has memory switched off', async () => {
    const conversationId = '11111111-1111-4111-8111-111111111111';
    mocks.userScopedDb.mockResolvedValue({
      db: {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('to_regclass')) return [{ ready: true }];
          if (sql.includes('insert into public.voice_sessions')) return [{ id: 'vs_4' }];
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
          if (sql.includes("settings -> 'capabilities'")) {
            return [{ capabilities: { memory: true } }];
          }
          if (sql.includes('from user_memories')) {
            return [{ content: 'Prefers metric units.', category: 'preference', pinned: true }];
          }
          return [];
        }),
      },
      userId: 'user-1',
      organizationId: null,
    });
    mocks.fetch.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            session: { id: 'live_4' },
            transport: { type: 'webrtc', sdp: 'answer' },
          }),
          { status: 201 },
        ),
    );

    const instructionsFor = async (body: Record<string, unknown>) => {
      mocks.fetch.mockClear();
      const response = await POST(request({ sdp: OFFER, conversationId, ...body }));
      expect(response.status).toBe(201);
      const [, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
      const sent = JSON.parse(String(init.body)) as {
        session: { instructions: string; delegation: { responses: { instructions: string } } };
      };
      return `${sent.session.instructions}\n${sent.session.delegation.responses.instructions}`;
    };

    await expect(instructionsFor({})).resolves.toContain('Prefers metric units.');
    await expect(instructionsFor({ memoryEnabled: false })).resolves.not.toContain(
      'Prefers metric units.',
    );
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
