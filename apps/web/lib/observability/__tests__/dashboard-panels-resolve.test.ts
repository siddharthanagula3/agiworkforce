import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { OBSERVABILITY_ATTRIBUTE, resetDeploymentAttributesCache } from '../attributes';
import { METRIC_LABEL_BOUND, resetLabelCardinality } from '../cardinality';
import { withSpan } from '../span';
import { SERVICE_DASHBOARDS, attributeKey, dashboardPanels, panelQuery } from '../dashboards';
import { recordMediaCallback, recordMediaGeneration, recordMediaPoll } from '../media-telemetry';
import {
  METRIC_NAME,
  recordBrowserTask,
  recordCompletion,
  recordConfigurationState,
  recordDenial,
  recordFailure,
  recordHttpRequest,
  recordNotificationDelivery,
  recordQueueAge,
  recordRejection,
  recordRoutingDecision,
  recordSpanMetrics,
  recordToolOutcome,
  recordTurnOutcome,
} from '../metrics';

const RELEASE_SHA = 'a1b2c3d4e5f6';

let reader: PeriodicExportingMetricReader;
let provider: MeterProvider;
let restoreEnv: Array<[string, string | undefined]>;

beforeAll(() => {
  restoreEnv = (['AGI_RELEASE_SHA', 'AGI_DEPLOY_ENV', 'AGI_DEPLOY_REGION'] as const).map((name) => [
    name,
    process.env[name],
  ]);
  process.env['AGI_RELEASE_SHA'] = RELEASE_SHA;
  process.env['AGI_DEPLOY_ENV'] = 'production';
  process.env['AGI_DEPLOY_REGION'] = 'iad1';
  resetDeploymentAttributesCache();
});

afterAll(() => {
  for (const [name, value] of restoreEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetDeploymentAttributesCache();
  metrics.disable();
});

beforeEach(() => {
  resetLabelCardinality();
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

/**
 * Exercise every recorder once so the exporter holds the real label set of every
 * instrument. Nothing here asserts; the assertions read what came out.
 */
async function emitEverySignal(): Promise<void> {
  recordSpanMetrics({ name: 'unit.span', domain: 'model', outcome: 'ok', durationMs: 4 });
  await withSpan(
    'gen_ai.chat',
    {
      domain: 'model',
      kind: 'client',
      attributes: {
        [OBSERVABILITY_ATTRIBUTE.providerName]: 'anthropic',
        [OBSERVABILITY_ATTRIBUTE.requestModel]: 'claude',
      },
    },
    () => 'done',
  );
  recordHttpRequest({
    method: 'POST',
    statusCode: 500,
    durationMs: 12,
    surface: 'web',
    clientVersion: '2026.9.1',
    protocolVersion: '1',
  });
  recordFailure('api', 'timeout');
  recordQueueAge({ queue: 'digest', oldestQueuedAgeMs: 10, stuck: 1 });
  recordBrowserTask({ status: 'failed', surface: 'web', errorType: 'blocked' });
  recordNotificationDelivery({ channel: 'email', outcome: 'delivered' });
  recordNotificationDelivery({ channel: 'email', outcome: 'failed', reason: 'bounced' });
  recordConfigurationState({ component: 'redis', state: 'ok' });
  recordRoutingDecision({
    status: 'selected',
    routeId: 'anthropic/claude',
    provider: 'anthropic',
    modelKey: 'claude',
    cohort: 'ga',
    trustMode: 'managed',
    region: 'us',
    surface: 'web',
  });
  recordRoutingDecision({
    status: 'unavailable',
    routeId: null,
    provider: 'anthropic',
    modelKey: 'claude',
    cohort: 'ga',
    trustMode: 'managed',
    region: 'us',
    surface: 'web',
  });
  recordToolOutcome({ category: 'mcp', status: 'failed', durationMs: 9, surface: 'web' });
  recordCompletion({
    kind: 'turn',
    surface: 'web',
    evidence: { reportedStatus: 'completed', outputRequired: true, output: null },
  });
  recordDenial({ layer: 'surface', reason: 'not_supported', surface: 'cli' });
  recordDenial({
    layer: 'entitlement',
    reason: 'plan_excluded',
    surface: 'web',
    workspaceKind: 'organization',
  });
  recordRejection({
    kind: 'contract_decode',
    reason: 'unknown_field',
    surface: 'desktop',
    clientVersion: '2026.8.0',
    protocolVersion: '1',
  });
  for (const outcome of ['succeeded', 'failed'] as const) {
    for (const cache of ['hit', 'miss'] as const) {
      recordTurnOutcome({
        outcome,
        surface: 'web',
        provider: 'anthropic',
        modelKey: 'claude',
        routeId: 'anthropic/claude',
        mode: 'chat',
        trustMode: 'managed',
        workspaceKind: 'personal',
        cache,
        timeToFirstTokenMs: 120,
        durationMs: 900,
        costMicroUsd: 2400,
        retries: 1,
        ...(outcome === 'failed' ? { errorType: 'timeout' } : {}),
      });
    }
  }
  recordMediaGeneration({
    media: 'image',
    outcome: 'failed',
    provider: 'openai',
    model: 'gpt-image',
    surface: 'web',
    mode: 'sync',
    latencyMs: 50,
  });
  recordMediaPoll({ media: 'video', outcome: 'pending', provider: 'runway' });
  recordMediaCallback({ media: 'video', outcome: 'accepted', provider: 'runway' });
}

async function emittedLabels(): Promise<Map<string, Set<string>>> {
  await emitEverySignal();
  const { resourceMetrics } = await reader.collect();
  const byMetric = new Map<string, Set<string>>();
  for (const scope of resourceMetrics.scopeMetrics) {
    for (const metric of scope.metrics) {
      const keys = byMetric.get(metric.descriptor.name) ?? new Set<string>();
      for (const point of metric.dataPoints) {
        for (const key of Object.keys(point.attributes)) keys.add(attributeKey(key));
      }
      byMetric.set(metric.descriptor.name, keys);
    }
  }
  return byMetric;
}

describe('every dashboard panel resolves to a signal the code emits', () => {
  it('names a metric some recorder actually produces', async () => {
    const emitted = await emittedLabels();
    const missing = dashboardPanels()
      .filter((panel) => !emitted.has(panel.metric))
      .map((panel) => `${panel.id} reads ${panel.metric}, which no recorder emits`);
    expect(missing).toEqual([]);
  });

  it('groups and selects only on labels that metric carries', async () => {
    const emitted = await emittedLabels();
    const unresolved: string[] = [];
    for (const panel of dashboardPanels()) {
      const labels = emitted.get(panel.metric) ?? new Set<string>();
      const referenced = [
        ...panel.groupBy,
        ...Object.keys(panel.match ?? {}),
        ...Object.keys(panel.of ?? {}),
      ];
      for (const dimension of referenced) {
        if (!labels.has(dimension)) {
          unresolved.push(`${panel.id} reads ${dimension}, absent from ${panel.metric}`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });

  it('declares a cardinality bound for every label that reaches an instrument', async () => {
    const emitted = await emittedLabels();
    const bounds = new Set(Object.keys(METRIC_LABEL_BOUND).map(attributeKey));
    const undeclared = new Set<string>();
    for (const labels of emitted.values()) {
      for (const label of labels) {
        if (!bounds.has(label)) undeclared.add(label);
      }
    }
    expect([...undeclared]).toEqual([]);
  });

  it('stamps the release onto every series, so a spike has a build', async () => {
    const emitted = await emittedLabels();
    const release = attributeKey(OBSERVABILITY_ATTRIBUTE.serviceVersion);
    const unstamped = [...emitted.entries()]
      .filter(([, labels]) => !labels.has(release))
      .map(([metric]) => metric);
    expect(unstamped).toEqual([]);
  });
});

describe('the dashboard catalogue', () => {
  it('names every dashboard and panel once', () => {
    const dashboardIds = SERVICE_DASHBOARDS.map((dashboard) => dashboard.id);
    expect(new Set(dashboardIds).size).toBe(dashboardIds.length);
    const panelIds = dashboardPanels().map((panel) => panel.id);
    expect(new Set(panelIds).size).toBe(panelIds.length);
  });

  it('renders a query for every panel with no unresolved placeholder', () => {
    for (const panel of dashboardPanels()) {
      const query = panelQuery(panel);
      expect(query, panel.id).not.toContain('undefined');
      expect(query, panel.id).toContain(attributeKey(panel.metric));
      for (const dimension of panel.groupBy) expect(query, panel.id).toContain(dimension);
    }
  });

  it('covers the foundation signals the platform is required to answer', () => {
    const byPanelId = new Map(dashboardPanels().map((panel) => [panel.id, panel]));
    const required = [
      'requests-by-surface',
      'client-version-distribution',
      'protocol-version-distribution',
      'turns-by-mode',
      'turns-by-workspace-kind',
      'denial-rate-by-layer',
      'unsupported-surface-attempts',
      'rejection-rate-by-kind',
      'ttft-p95',
      'ttft-p99',
      'turn-wall-time-p99',
      'turn-cost-p50',
      'prompt-cache-hit-ratio',
      'turn-retry-rate',
      'false-success-by-release',
    ];
    for (const id of required) expect(byPanelId.has(id), `${id} has no panel`).toBe(true);
  });
});

describe('the refusal and rejection vocabularies', () => {
  it('counts each denial layer under its own label', async () => {
    const emitted = await emittedLabels();
    expect(emitted.get(METRIC_NAME.denials)).toContain(
      attributeKey(OBSERVABILITY_ATTRIBUTE.denialLayer),
    );
    expect(emitted.get(METRIC_NAME.rejections)).toContain(
      attributeKey(OBSERVABILITY_ATTRIBUTE.rejectionKind),
    );
  });
});
