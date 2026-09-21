import { createHmac } from 'node:crypto';

import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => stubDatabase() }));
vi.mock('@/lib/feature-flags/flag-evaluation-service', () => ({
  evaluateFlagsForSubject: vi.fn(async () => flagEvaluations),
}));
vi.mock('@/lib/services/model-policy-service', () => ({
  readModelPolicy: vi.fn(async () => ({})),
}));
vi.mock('@/lib/services/model-policy-evaluator', () => ({
  evaluateModelAccess: vi.fn(() => ({
    allowed: false,
    code: 'provider_blocked',
    reason: 'The workspace policy does not allow this provider.',
  })),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn(async () => null) },
}));

import { METRIC_NAME } from '../metrics';
import { attributeKey } from '../dashboards';
import { OBSERVABILITY_ATTRIBUTE, resetDeploymentAttributesCache } from '../attributes';
import { resetLabelCardinality } from '../cardinality';
import { withErrorHandler } from '@/lib/error-handler';
import { API_VERSION_REQUEST_HEADER } from '@/lib/api-gateway-policy';
import { assertCapabilityAvailable } from '@/lib/feature-flags/capability-gate';
import {
  TENANT_LOCKDOWN_FLAG_KEY,
  capabilityKillSwitchKey,
} from '@/lib/feature-flags/kill-switches';
import { evaluateModelAccessForOrganization } from '@/lib/services/model-policy-gate';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';
import {
  persistRoutingDecision,
  persistRoutingDecisionOutcome,
} from '@/lib/services/model-rollout/routing-decision-trace-service';
import { verifyOpenRouterVideoWebhook } from '@/lib/services/openrouter-video-webhook-service';

let flagEvaluations: Record<string, { variant: string; enabled: boolean }> = {};

function stubDatabase(rows: unknown[] = []): DatabaseAdapter {
  return {
    query: vi.fn(async () => rows),
    execute: vi.fn(async () => undefined),
    transaction: vi.fn(async (run: (db: DatabaseAdapter) => Promise<unknown>) =>
      run(stubDatabase(rows)),
    ),
    withUser: vi.fn(),
    dispose: vi.fn(),
  } as unknown as DatabaseAdapter;
}

let reader: PeriodicExportingMetricReader;
let provider: MeterProvider;

beforeEach(() => {
  flagEvaluations = {};
  resetLabelCardinality();
  resetDeploymentAttributesCache();
  metrics.disable();
  reader = new PeriodicExportingMetricReader({
    exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
    exportIntervalMillis: 60_000,
  });
  provider = new MeterProvider({ readers: [reader] });
  metrics.setGlobalMeterProvider(provider);
});

afterEach(async () => {
  await provider.shutdown();
});

afterAll(() => {
  metrics.disable();
});

interface Series {
  readonly value: number;
  readonly attributes: Record<string, unknown>;
}

async function seriesFor(metric: string): Promise<Series[]> {
  const { resourceMetrics } = await reader.collect();
  const out: Series[] = [];
  for (const scope of resourceMetrics.scopeMetrics) {
    for (const collected of scope.metrics) {
      if (collected.descriptor.name !== metric) continue;
      for (const point of collected.dataPoints) {
        const attributes: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(point.attributes)) {
          attributes[attributeKey(key)] = value;
        }
        out.push({ value: point.value as number, attributes });
      }
    }
  }
  return out;
}

const LAYER = attributeKey(OBSERVABILITY_ATTRIBUTE.denialLayer);
const REASON = attributeKey(OBSERVABILITY_ATTRIBUTE.denialReason);
const KIND = attributeKey(OBSERVABILITY_ATTRIBUTE.rejectionKind);
const SURFACE = attributeKey(OBSERVABILITY_ATTRIBUTE.surface);
const WORKSPACE_KIND = attributeKey(OBSERVABILITY_ATTRIBUTE.workspaceKind);

function subject(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user_1',
    workspaceId: null,
    role: null,
    plan: null,
    region: null,
    country: null,
    surface: 'web',
    clientVersion: null,
    ...overrides,
  } as Parameters<typeof assertCapabilityAvailable>[0];
}

describe('a refusal is counted by the layer that made it', () => {
  it('counts a capability a kill switch closed', async () => {
    flagEvaluations = { [capabilityKillSwitchKey('canChat')]: { variant: 'off', enabled: false } };
    await expect(assertCapabilityAvailable(subject(), 'canChat', 'Chat')).rejects.toThrow();

    const denials = await seriesFor(METRIC_NAME.denials);
    expect(denials).toHaveLength(1);
    expect(denials[0]?.attributes[LAYER]).toBe('capability');
    expect(denials[0]?.attributes[REASON]).toBe('temporarily_unavailable');
    expect(denials[0]?.attributes[SURFACE]).toBe('web');
    expect(denials[0]?.attributes[WORKSPACE_KIND]).toBe('personal');
  });

  it('counts a workspace locked down under the layer that locked it', async () => {
    flagEvaluations = { [TENANT_LOCKDOWN_FLAG_KEY]: { variant: 'off', enabled: false } };
    await expect(
      assertCapabilityAvailable(subject({ workspaceId: 'org_1' }), 'canChat', 'Chat'),
    ).rejects.toThrow();

    const denials = await seriesFor(METRIC_NAME.denials);
    expect(denials[0]?.attributes[REASON]).toBe('disabled_by_organization');
    expect(denials[0]?.attributes[WORKSPACE_KIND]).toBe('organization');
  });

  it('counts a model a workspace policy refused as a policy denial', async () => {
    const decision = await evaluateModelAccessForOrganization(stubDatabase(), 'org_1', {
      provider: 'openai',
      modelId: 'model-under-test',
    } as Parameters<typeof evaluateModelAccessForOrganization>[2]);
    expect(decision.allowed).toBe(false);

    const denials = await seriesFor(METRIC_NAME.denials);
    expect(denials).toHaveLength(1);
    expect(denials[0]?.attributes[LAYER]).toBe('policy');
    expect(denials[0]?.attributes[REASON]).toBe('policy_blocked');
    expect(denials[0]?.attributes[WORKSPACE_KIND]).toBe('organization');
  });

  it('counts an account with no subscription as an entitlement denial', async () => {
    const bundle = await resolveEntitlementBundle(stubDatabase(), 'user_1', {
      includeSeats: false,
    });
    expect(bundle.entitled).toBe(false);

    const denials = await seriesFor(METRIC_NAME.denials);
    expect(denials).toHaveLength(1);
    expect(denials[0]?.attributes[LAYER]).toBe('entitlement');
    expect(denials[0]?.attributes[REASON]).toBe('entitlement_missing');
  });

  it('keeps the three layers apart rather than summing them', async () => {
    flagEvaluations = { [capabilityKillSwitchKey('canChat')]: { variant: 'off', enabled: false } };
    await expect(assertCapabilityAvailable(subject(), 'canChat', 'Chat')).rejects.toThrow();
    await evaluateModelAccessForOrganization(stubDatabase(), 'org_1', {
      provider: 'openai',
      modelId: 'model-under-test',
    } as Parameters<typeof evaluateModelAccessForOrganization>[2]);
    await resolveEntitlementBundle(stubDatabase(), 'user_1', { includeSeats: false });

    const layers = (await seriesFor(METRIC_NAME.denials)).map((point) => point.attributes[LAYER]);
    expect(new Set(layers)).toEqual(new Set(['capability', 'policy', 'entitlement']));
  });
});

describe('input the product could not make sense of is counted as a rejection', () => {
  function workspaceRequest(selector: string) {
    return {
      headers: { get: (name: string) => (name === 'x-agi-organization-id' ? selector : null) },
    };
  }

  it('counts a workspace selector the server will not honour', async () => {
    await expect(
      resolveActiveOrganizationId(stubDatabase(), 'user_1', workspaceRequest('not-a-uuid')),
    ).rejects.toThrow();

    const rejections = await seriesFor(METRIC_NAME.rejections);
    expect(rejections).toHaveLength(1);
    expect(rejections[0]?.attributes[KIND]).toBe('workspace_switch');
  });

  it('counts a switch to a workspace the caller does not belong to', async () => {
    await expect(
      resolveActiveOrganizationId(
        stubDatabase([]),
        'user_1',
        workspaceRequest('11111111-1111-4111-8111-111111111111'),
      ),
    ).rejects.toThrow();

    const rejections = await seriesFor(METRIC_NAME.rejections);
    expect(rejections.map((point) => point.attributes[KIND])).toEqual(['workspace_switch']);
  });

  it('separates a provider event this build does not know from a payload that fails the shape', () => {
    const secret = 'whsec_test_secret';
    const send = (body: unknown): void => {
      const rawBody = Buffer.from(JSON.stringify(body), 'utf8');
      const timestamp = String(Math.floor(Date.now() / 1_000));
      const signature = createHmac('sha256', secret)
        .update(Buffer.from(`${timestamp},`, 'utf8'))
        .update(rawBody)
        .digest('hex');
      verifyOpenRouterVideoWebhook({
        rawBody,
        signatureHeader: `t=${timestamp},v1=${signature}`,
        idempotencyKey: null,
        signingSecret: secret,
      });
    };

    expect(() =>
      send({
        type: 'video.generation.transcoded',
        created_at: new Date().toISOString(),
        data: { id: 'task_1', status: 'completed' },
      }),
    ).toThrow();
    expect(() => send({ type: 'video.generation.completed', data: {} })).toThrow();

    return seriesFor(METRIC_NAME.rejections).then((rejections) => {
      const kinds = rejections.map((point) => point.attributes[KIND]);
      expect(new Set(kinds)).toEqual(new Set(['unknown_event', 'contract_decode']));
      for (const point of rejections) expect(point.attributes[SURFACE]).toBe('api');
    });
  });
});

describe('a served turn is measured where its decision was traced', () => {
  const trace = {
    schemaVersion: 1,
    requestId: 'req_1',
    selection: 'auto',
    taskType: 'chat',
    trustMode: 'managed',
    tier: null,
    region: 'us',
    status: 'selected',
    code: null,
    reason: null,
    modelKey: 'claude',
    provider: 'anthropic',
    routeId: 'anthropic/claude',
    slotId: null,
    cohort: 'ga',
    lifecycleStage: 'ga',
    fallbacks: [{ routeId: 'openai/gpt', modelKey: 'gpt' }],
    shadow: null,
    reasons: [],
    stages: { observedHealth: true, canary: false, shadow: false, taskFamily: false },
    inputs: {
      capabilitiesInUse: [],
      observedRouteCount: 2,
      unhonouredRouteCount: 0,
      unfundedRouteCount: 0,
      policyExcludedRouteCount: 0,
      preferredRouteId: null,
      currentModelKey: null,
      budgetConstrained: false,
      workspaceModelPolicy: false,
      zeroDataRetentionOnly: false,
      usOnly: false,
      excludedProviderCount: 0,
      excludedRouteHostCount: 0,
      canaryCohorts: {},
    },
    observed: { failureRate: null, latencyP50Ms: null },
  };

  function decision(kind: 'served' | 'shadow', flagVariants: Record<string, string> = {}) {
    return {
      trace,
      requestId: 'req_1',
      userId: 'user_1',
      organizationId: 'org_1',
      surface: 'web',
      kind,
      flagVariants,
    } as unknown as Parameters<typeof persistRoutingDecision>[0];
  }

  it('records the cost and the latency of the turn against the route that served it', async () => {
    persistRoutingDecision(decision('served'));
    persistRoutingDecisionOutcome({
      requestId: 'req_1',
      kind: 'served',
      outcome: 'succeeded',
      ttftMs: 120,
      durationMs: 900,
      providerCostMicrousd: 2_400,
    });

    const turns = await seriesFor(METRIC_NAME.turns);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.attributes[SURFACE]).toBe('web');
    expect(turns[0]?.attributes[WORKSPACE_KIND]).toBe('organization');
    expect(turns[0]?.attributes[attributeKey(OBSERVABILITY_ATTRIBUTE.requestMode)]).toBe('chat');
    expect(turns[0]?.attributes[attributeKey(OBSERVABILITY_ATTRIBUTE.trustMode)]).toBe('managed');

    const cost = await seriesFor(METRIC_NAME.turnCost);
    expect(cost).toHaveLength(1);
    const ttft = await seriesFor(METRIC_NAME.turnTimeToFirstToken);
    expect(ttft).toHaveLength(1);
  });

  // Two arms share one build, so a canary that is worse than its control is
  // invisible in anything grouped by release alone.
  it('labels the turn with the rollout arm and the flag variants it was served under', async () => {
    persistRoutingDecision(decision('served', { newComposer: 'on', autoRouter: 'v3' }));
    persistRoutingDecisionOutcome({
      requestId: 'req_1',
      kind: 'served',
      outcome: 'succeeded',
      ttftMs: 120,
      durationMs: 900,
      providerCostMicrousd: 2_400,
    });

    const turns = await seriesFor(METRIC_NAME.turns);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.attributes[attributeKey(OBSERVABILITY_ATTRIBUTE.routingCohort)]).toBe(
      'ga,autoRouter=v3,newComposer=on',
    );
  });

  it('opens one series per cohort however the variants were ordered', async () => {
    persistRoutingDecision(decision('served', { autoRouter: 'v3', newComposer: 'on' }));
    persistRoutingDecisionOutcome({
      requestId: 'req_1',
      kind: 'served',
      outcome: 'succeeded',
      durationMs: 900,
    });
    persistRoutingDecision(decision('served', { newComposer: 'on', autoRouter: 'v3' }));
    persistRoutingDecisionOutcome({
      requestId: 'req_1',
      kind: 'served',
      outcome: 'succeeded',
      durationMs: 900,
    });

    const turns = await seriesFor(METRIC_NAME.turns);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.value).toBe(2);
  });

  it('counts the routes tried before the one that answered', async () => {
    persistRoutingDecision(decision('served'));
    persistRoutingDecisionOutcome({
      requestId: 'req_1',
      kind: 'served',
      outcome: 'succeeded',
      durationMs: 10,
    });

    const retries = await seriesFor(METRIC_NAME.turnRetries);
    expect(retries[0]?.value).toBe(1);
  });

  it('leaves a shadow turn out: nobody was served it', async () => {
    persistRoutingDecision(decision('shadow'));
    persistRoutingDecisionOutcome({
      requestId: 'req_1',
      kind: 'shadow',
      outcome: 'succeeded',
      durationMs: 10,
    });

    expect(await seriesFor(METRIC_NAME.turns)).toEqual([]);
  });

  it('does not measure a turn whose decision this process never traced', async () => {
    persistRoutingDecisionOutcome({
      requestId: 'untraced',
      kind: 'served',
      outcome: 'failed',
      durationMs: 10,
    });

    expect(await seriesFor(METRIC_NAME.turns)).toEqual([]);
  });
});

describe('every request carries what the caller said it was', () => {
  function request(headers: Record<string, string>): Request {
    return new Request('https://app.example.com/api/thing', { method: 'POST', headers });
  }

  const handled = withErrorHandler(
    async (_request: Request) => new Response('ok', { status: 200 }),
  );

  // The build is the release series, not the exact patch: patch moves weekly and
  // is what made this label unbounded.
  it('labels the surface, the client release series and the contract version', async () => {
    await handled(
      request({
        'x-agi-surface': 'desktop',
        'x-agi-client-version': '2026.9.1',
        [API_VERSION_REQUEST_HEADER]: '2026-09-17',
      }),
    );

    const requests = await seriesFor(METRIC_NAME.httpRequests);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.attributes[SURFACE]).toBe('desktop');
    expect(requests[0]?.attributes[attributeKey(OBSERVABILITY_ATTRIBUTE.clientVersion)]).toBe(
      '2026.9',
    );
    expect(requests[0]?.attributes[attributeKey(OBSERVABILITY_ATTRIBUTE.protocolVersion)]).toBe(
      '2026-09-17',
    );
  });

  it('reads the IDE from the client header the extension already sends', async () => {
    await handled(request({ 'x-client': 'vscode-extension' }));
    const requests = await seriesFor(METRIC_NAME.httpRequests);
    expect(requests[0]?.attributes[SURFACE]).toBe('vscode');
  });

  // A header is typed by the caller, so an unbounded value would open a series
  // per request rather than describe the fleet.
  it('drops a surface the product does not have', async () => {
    await handled(request({ 'x-agi-surface': 'fax-machine' }));
    const requests = await seriesFor(METRIC_NAME.httpRequests);
    expect(requests[0]?.attributes[SURFACE]).toBeUndefined();
  });

  it('folds every unsupported contract version into one label', async () => {
    await handled(request({ [API_VERSION_REQUEST_HEADER]: '1998-01-01' }));
    await handled(request({ [API_VERSION_REQUEST_HEADER]: '1999-01-01' }));

    const versions = (await seriesFor(METRIC_NAME.httpRequests)).map(
      (point) => point.attributes[attributeKey(OBSERVABILITY_ATTRIBUTE.protocolVersion)],
    );
    expect(new Set(versions)).toEqual(new Set(['unsupported']));
  });
});
