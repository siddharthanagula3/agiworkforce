import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  getUnhonouredCapabilities: vi.fn(
    async (_routeIds: readonly string[], _capabilities: readonly string[]) =>
      ({}) as Record<string, readonly string[]>,
  ),
  readShadowRequestsToday: vi.fn(async (_nowMs?: number) => ({}) as Record<string, number>),
  evaluateFlagsForSubject: vi.fn(
    async (_subject: unknown, _options?: unknown, _nowMs?: number) =>
      ({}) as Record<string, unknown>,
  ),
}));

vi.mock('@/lib/services/free-lane/capability-health-service', () => ({
  getUnhonouredCapabilities: (routeIds: readonly string[], capabilities: readonly string[]) =>
    mocks.getUnhonouredCapabilities(routeIds, capabilities),
  TOOL_CALLING_CAPABILITY: 'functionCalling',
  STRUCTURED_OUTPUT_CAPABILITY: 'structuredOutput',
}));

vi.mock('../shadow-dispatch-service', () => ({
  readShadowRequestsToday: (nowMs?: number) => mocks.readShadowRequestsToday(nowMs),
}));

vi.mock('@/lib/feature-flags/flag-evaluation-service', () => ({
  buildFlagSubject: (_request: Request, facts: unknown) => facts,
  evaluateFlagsForSubject: (subject: unknown, options?: unknown, nowMs?: number) =>
    mocks.evaluateFlagsForSubject(subject, options, nowMs),
}));

import type { AutoRoutingRequest } from '@agiworkforce/routing';

import {
  capabilitiesInUseForRequest,
  resolveWebCloudRolloutInputs,
  resolveWithObservedCapabilities,
} from '../rollout-routing-inputs';

const ROUTING_REQUEST: AutoRoutingRequest = {
  selection: 'auto',
  taskType: 'simple_chat',
  subscriptionTier: 'pro',
  trustMode: 'managed_cloud',
  runtimeProfileId: 'web/cloud-chat',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readShadowRequestsToday.mockResolvedValue({});
  mocks.evaluateFlagsForSubject.mockResolvedValue({});
});

describe('capabilities a request actually carries', () => {
  it('names tool calling only when tools are offered and not refused', () => {
    expect(capabilitiesInUseForRequest({ tools: [{}] })).toEqual(['functionCalling']);
    expect(capabilitiesInUseForRequest({ tools: [{}], tool_choice: 'none' })).toEqual([]);
    expect(capabilitiesInUseForRequest({})).toEqual([]);
  });

  it('names structured output for a json response format', () => {
    expect(capabilitiesInUseForRequest({ response_format: { type: 'json_object' } })).toEqual([
      'structuredOutput',
    ]);
  });
});

describe('observed capability routing on the serving path', () => {
  it('reads the capability store for the routes this request would use', async () => {
    mocks.getUnhonouredCapabilities.mockResolvedValue({});
    const { decision } = await resolveWithObservedCapabilities({
      ...ROUTING_REQUEST,
      capabilitiesInUse: ['functionCalling'],
    });
    expect(decision.status).toBe('selected');
    expect(mocks.getUnhonouredCapabilities).toHaveBeenCalledOnce();
    const [routeIds, capabilities] = mocks.getUnhonouredCapabilities.mock.calls[0] as unknown as [
      string[],
      string[],
    ];
    expect(routeIds.length).toBeGreaterThan(0);
    expect(capabilities).toEqual(['functionCalling']);
  });

  it('never reads the store for a request that carries no capability', async () => {
    await resolveWithObservedCapabilities(ROUTING_REQUEST);
    expect(mocks.getUnhonouredCapabilities).not.toHaveBeenCalled();
  });

  it('re-resolves with the observed loss so a route that stopped honouring tools sinks', async () => {
    mocks.getUnhonouredCapabilities.mockResolvedValue({});
    const first = await resolveWithObservedCapabilities({
      ...ROUTING_REQUEST,
      capabilitiesInUse: ['functionCalling'],
    });
    if (first.decision.status !== 'selected') throw new Error('expected a selected route');
    mocks.getUnhonouredCapabilities.mockResolvedValue({
      [first.decision.routeId]: ['functionCalling'],
    });
    const second = await resolveWithObservedCapabilities({
      ...ROUTING_REQUEST,
      capabilitiesInUse: ['functionCalling'],
    });
    expect(second.routingRequest.observedRouteHealth?.[first.decision.routeId]).toEqual({
      unhonouredCapabilities: ['functionCalling'],
    });
  });

  it('routes on the declared catalog when the capability store cannot answer', async () => {
    mocks.getUnhonouredCapabilities.mockRejectedValue(new Error('store down'));
    const { decision } = await resolveWithObservedCapabilities({
      ...ROUTING_REQUEST,
      capabilitiesInUse: ['functionCalling'],
    });
    expect(decision.status).toBe('selected');
  });
});

describe('rollout routing inputs', () => {
  it('leaves every stage at its default when no routing flag exists', async () => {
    const inputs = await resolveWebCloudRolloutInputs({
      request: new Request('http://localhost/api/llm/v1/chat/completions'),
      subject: { userId: 'user_1', workspaceId: null, role: null, plan: 'pro', surface: 'web' },
      requestId: 'request-1',
      signals: {},
    });
    expect(inputs.enableCanary).toBeUndefined();
    expect(inputs.enableShadow).toBeUndefined();
    expect(inputs.enableObservedHealthRanking).toBeUndefined();
    expect(inputs.region).toBe('us');
    expect(inputs.flagVariants).toEqual({});
  });

  it('buckets a conversation rather than a single request when there is one', async () => {
    const inputs = await resolveWebCloudRolloutInputs({
      request: new Request('http://localhost/api/llm/v1/chat/completions'),
      subject: { userId: 'user_1', workspaceId: null, role: null, plan: 'pro', surface: 'web' },
      requestId: 'request-1',
      conversationId: 'conversation-9',
      signals: { tools: [{}] },
    });
    expect(inputs.requestId).toBe('conversation-9');
    expect(inputs.capabilitiesInUse).toEqual(['functionCalling']);
  });

  it('carries a flag-driven canary cohort and kill switch through to the resolver', async () => {
    mocks.evaluateFlagsForSubject.mockResolvedValue({
      'routing.shadow': {
        key: 'routing.shadow',
        variant: 'off',
        enabled: false,
        reason: 'kill_switch',
        ruleId: null,
        version: 2,
      },
      'routing.canary.coding_balanced': {
        key: 'routing.canary.coding_balanced',
        variant: 'on',
        enabled: true,
        reason: 'rule',
        ruleId: 'ramp',
        version: 4,
      },
    });
    const inputs = await resolveWebCloudRolloutInputs({
      request: new Request('http://localhost/api/llm/v1/chat/completions'),
      subject: { userId: 'user_1', workspaceId: null, role: null, plan: 'pro', surface: 'web' },
      requestId: 'request-1',
      signals: {},
    });
    expect(inputs.enableShadow).toBe(false);
    expect(inputs.canaryCohorts).toEqual({ coding_balanced: true });
  });
});
