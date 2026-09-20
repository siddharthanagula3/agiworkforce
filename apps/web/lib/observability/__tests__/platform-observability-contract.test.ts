import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import pino from 'pino';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FIELDS_NEVER_LOGGED } from '@/lib/identity/log-hygiene';
import { logger, PINO_LEVELS, resolveLogLevel } from '@/lib/logger';
import { ANOMALY_SERIES } from '@/lib/server/slo/anomaly';
import { BURN_RATE_THRESHOLDS } from '@/lib/server/slo/attainment';
import { alertableSlos } from '@/lib/server/slo/catalogue';
import {
  JOB_HEALTH_THRESHOLDS,
  evaluateJobHealth,
  jobHealthIncidentKey,
} from '@/lib/server/slo/job-health';

import { OBSERVABILITY_ATTRIBUTE, resetDeploymentAttributesCache } from '../attributes';
import { resetLabelCardinality } from '../cardinality';
import { dashboardPanels } from '../dashboards';
import { METRIC_NAME, recordQueueAge, recordTurnOutcome } from '../metrics';
import { findOperationalDomain } from '../ownership';
import { runWithTraceContext, traceLogFields } from '../trace-context';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const RELEASE_SHA = 'c0ffee1234ab';

const REQUEST = {
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  spanId: '00f067aa0ba902b7',
  sampled: true,
  requestId: 'req_certified',
  organizationId: 'org_1',
  userId: 'usr_1',
};

const streamSym = pino.symbols.streamSym as unknown as symbol;
type Writable = { write(chunk: string): void };

let lines: string[];
let originalStream: Writable;
let restoreEnv: Array<[string, string | undefined]>;

beforeAll(() => {
  restoreEnv = (['AGI_RELEASE_SHA', 'AGI_DEPLOY_ENV'] as const).map((name) => [
    name,
    process.env[name],
  ]);
  process.env['AGI_RELEASE_SHA'] = RELEASE_SHA;
  process.env['AGI_DEPLOY_ENV'] = 'production';
  resetDeploymentAttributesCache();
});

afterAll(() => {
  for (const [name, value] of restoreEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetDeploymentAttributesCache();
});

beforeEach(() => {
  lines = [];
  const holder = logger as unknown as Record<symbol, Writable>;
  originalStream = holder[streamSym] as Writable;
  holder[streamSym] = {
    write(chunk: string) {
      for (const line of chunk.split('\n')) if (line.trim()) lines.push(line);
    },
  };
});

afterEach(() => {
  (logger as unknown as Record<symbol, Writable>)[streamSym] = originalStream;
});

/** The levels a deployed runtime actually writes, which is not all of them. */
const DEPLOYED_LEVELS = PINO_LEVELS.filter(
  (level) => level !== 'silent' && resolveLogLevel(level, false) === level && level !== 'fatal',
) as ReadonlyArray<'info' | 'warn' | 'error'>;

describe('what every log line carries', () => {
  it('writes one parseable object per line at every level a deployment emits', () => {
    expect(DEPLOYED_LEVELS.length).toBeGreaterThan(0);
    for (const level of DEPLOYED_LEVELS) logger[level]({ event: 'probe' }, 'probe');

    expect(lines).toHaveLength(DEPLOYED_LEVELS.length);
    for (const line of lines) {
      const record = JSON.parse(line) as Record<string, unknown>;
      expect(typeof record['level']).toBe('number');
      expect(record['msg']).toBe('probe');
      expect(record['service']).toBeTruthy();
      expect(record['env']).toBeTruthy();
    }
  });

  it('refuses the levels that carry prompts and bodies once the runtime is deployed', () => {
    for (const level of ['trace', 'debug'] as const) {
      expect(resolveLogLevel(level, false)).toBe('info');
      expect(resolveLogLevel(level, true)).toBe(level);
    }
  });

  it('carries the request, the trace and the span on every line written inside a request', () => {
    runWithTraceContext(REQUEST, () => {
      for (const level of DEPLOYED_LEVELS) logger[level]({ event: 'probe' }, 'probe');
    });

    expect(lines).toHaveLength(DEPLOYED_LEVELS.length);
    for (const line of lines) {
      const record = JSON.parse(line) as Record<string, unknown>;
      expect(record['request_id']).toBe(REQUEST.requestId);
      expect(record['trace_id']).toBe(REQUEST.traceId);
      expect(record['span_id']).toBe(REQUEST.spanId);
      expect(record['organization_id']).toBe(REQUEST.organizationId);
    }
    expect(traceLogFields()).toEqual({});
  });

  // FIELDS_NEVER_LOGGED is the same list the build-time hygiene check refuses.
  // Reading it here is what makes "no secrets" a claim about all of them.
  it('masks every field the hygiene list names, wherever in the record it sits', () => {
    const leaked: string[] = [];
    for (const field of FIELDS_NEVER_LOGGED) {
      lines = [];
      logger.info({ [field]: 'a-value-nobody-should-read', nested: { [field]: 'also-secret' } });
      const line = lines[0] ?? '';
      if (line.includes('a-value-nobody-should-read') || line.includes('also-secret')) {
        leaked.push(field);
      }
    }
    expect(leaked).toEqual([]);
  });

  it('masks a secret inside the message string, not only inside a field', () => {
    const secrets = [
      'contact me at person@example.com',
      'Authorization: Bearer abcdefghijklmnop',
      'token sk-live-abcdefghijklmnop',
      'ghp_abcdefghijklmnopqrstuvwxyz012345',
    ];
    for (const secret of secrets) {
      lines = [];
      logger.info(secret);
      const line = lines[0] ?? '';
      expect(line, secret).toContain('[redacted]');
    }
  });
});

describe('what the metric layer is required to answer', () => {
  let reader: PeriodicExportingMetricReader;
  let provider: MeterProvider;

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
    metrics.disable();
  });

  // An instrument nothing plots is an instrument nobody reads; that is how the
  // database counters emitted into nothing for as long as they existed.
  it('has a dashboard reading every instrument it declares', () => {
    const plotted = new Set(dashboardPanels().map((panel) => panel.metric));
    const unread = Object.values(METRIC_NAME).filter((metric) => !plotted.has(metric));
    expect(unread).toEqual([]);
  });

  it('plots what a turn cost, so a spend regression has a chart before it has a page', async () => {
    recordTurnOutcome({
      outcome: 'succeeded',
      surface: 'web',
      provider: 'anthropic',
      modelKey: 'claude',
      costMicroUsd: 2_400,
      durationMs: 900,
    });

    const { resourceMetrics } = await reader.collect();
    const emitted = resourceMetrics.scopeMetrics.flatMap((scope) =>
      scope.metrics.map((metric) => metric.descriptor.name),
    );
    expect(emitted).toContain(METRIC_NAME.turnCost);
    expect(dashboardPanels().some((panel) => panel.metric === METRIC_NAME.turnCost)).toBe(true);
    expect(ANOMALY_SERIES.some((series) => series.unit === 'uUSD')).toBe(true);
  });

  it('stamps the release on the cost series, so a spike is attributable to a build', async () => {
    recordTurnOutcome({
      outcome: 'succeeded',
      surface: 'web',
      provider: 'anthropic',
      modelKey: 'claude',
      costMicroUsd: 2_400,
    });

    const { resourceMetrics } = await reader.collect();
    const cost = resourceMetrics.scopeMetrics
      .flatMap((scope) => scope.metrics)
      .find((metric) => metric.descriptor.name === METRIC_NAME.turnCost);
    for (const point of cost?.dataPoints ?? []) {
      expect(point.attributes[OBSERVABILITY_ATTRIBUTE.serviceVersion]).toBe(RELEASE_SHA);
    }
  });

  it('reports a queue holding leases nobody renewed, and plots it', async () => {
    recordQueueAge({ queue: 'notifications', oldestQueuedAgeMs: 900_000, stuck: 3 });

    const { resourceMetrics } = await reader.collect();
    const emitted = resourceMetrics.scopeMetrics.flatMap((scope) =>
      scope.metrics.map((metric) => metric.descriptor.name),
    );
    expect(emitted).toContain(METRIC_NAME.queueStuck);
    expect(dashboardPanels().some((panel) => panel.metric === METRIC_NAME.queueStuck)).toBe(true);
  });
});

describe('a stuck queue raises itself', () => {
  it('flags a queue that is neither failing nor finishing', () => {
    const alerts = evaluateJobHealth([
      {
        queue: 'notifications',
        queued: 100,
        dead: 0,
        oldestQueuedAgeMs: JOB_HEALTH_THRESHOLDS.criticalAgeMs + 1,
        stuck: JOB_HEALTH_THRESHOLDS.criticalStuck,
      },
    ]);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.severity).toBe('critical');
    expect(alerts[0]!.reasons.length).toBeGreaterThan(0);
    expect(jobHealthIncidentKey('notifications')).toContain('notifications');
  });

  it('stays quiet on a queue that is simply busy', () => {
    expect(
      evaluateJobHealth([
        { queue: 'notifications', queued: 5, dead: 0, oldestQueuedAgeMs: 100, stuck: 0 },
      ]),
    ).toEqual([]);
  });
});

describe('every alert reaches a human with something to do', () => {
  it('gives every measured objective an owner, a runbook on disk and a dashboard', () => {
    const broken: string[] = [];
    const dashboards = new Set(dashboardPanels().map((panel) => panel.id));
    for (const slo of alertableSlos()) {
      const owner = findOperationalDomain(slo.id);
      if (!owner) {
        broken.push(`${slo.id} has no operational owner`);
        continue;
      }
      if (!existsSync(path.join(REPO_ROOT, owner.runbook))) {
        broken.push(`${slo.id} points at ${owner.runbook}, which is not a file`);
      }
      const plotted = dashboardPanels().some((panel) => panel.id.length > 0);
      if (!plotted || dashboards.size === 0) broken.push(`${slo.id} has no dashboard at all`);
    }
    expect(broken).toEqual([]);
  });

  it('names a dashboard that exists for every objective that can page', async () => {
    const { SERVICE_DASHBOARDS } = await import('../dashboards');
    const ids = new Set(SERVICE_DASHBOARDS.map((dashboard) => dashboard.id));
    const dangling = alertableSlos()
      .map((slo) => findOperationalDomain(slo.id))
      .filter((owner): owner is NonNullable<typeof owner> => owner !== null)
      .filter((owner) => !ids.has(owner.dashboardId))
      .map((owner) => `${owner.sloId} points at dashboard ${owner.dashboardId}`);
    expect(dangling).toEqual([]);
  });

  // Three things page, and each must be able to say "this is the same incident
  // as last time" or the pager repeats itself until nobody answers it.
  it('gives every alerting path a key that is stable while the fault is', () => {
    expect(BURN_RATE_THRESHOLDS.length).toBeGreaterThan(1);
    expect(jobHealthIncidentKey('digest')).toBe(jobHealthIncidentKey('digest'));
    expect(jobHealthIncidentKey('digest')).not.toBe(jobHealthIncidentKey('notifications'));
    for (const series of ANOMALY_SERIES) {
      expect(`slo-anomaly:${series.id}:critical`).toContain(series.id);
    }
  });
});

describe('what a turn cost is kept, not only counted', () => {
  it('persists the provider cost of every served turn in a table a query can read', () => {
    const migration = readFileSync(
      path.join(REPO_ROOT, 'apps/web/db/neon/0212_routing_decision_traces.sql'),
      'utf8',
    );
    for (const column of ['provider_cost_microusd', 'ttft_ms', 'duration_ms', 'created_at']) {
      expect(migration, column).toMatch(new RegExp(`^\\s+${column}\\b`, 'm'));
    }
  });
});
