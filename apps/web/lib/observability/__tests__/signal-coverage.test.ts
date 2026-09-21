import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PRODUCTION_DEPENDENCIES } from '@/lib/config/dependency-readiness';

import { OBSERVABILITY_ATTRIBUTE, resetDeploymentAttributesCache } from '../attributes';
import { LOCAL_METRIC_LABEL, METRIC_LABEL_BOUND, resetLabelCardinality } from '../cardinality';
import { SERVICE_DASHBOARDS, attributeKey, dashboardPanels } from '../dashboards';
import { METRIC_NAME, recordFailure, recordQueueAge, recordQueueDepth } from '../metrics';
import {
  DEPENDENCY_SIGNALS,
  SPAN_DOMAIN_EVIDENCE,
  dependencySignal,
  unwatchedDependencies,
} from '../signal-coverage';
import { SPAN_DOMAINS, withSpan } from '../span';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');

let reader: PeriodicExportingMetricReader;
let provider: MeterProvider;

beforeEach(() => {
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

async function emittedLabels(): Promise<Map<string, Set<string>>> {
  const { resourceMetrics } = await reader.collect();
  const byMetric = new Map<string, Set<string>>();
  for (const scope of resourceMetrics.scopeMetrics) {
    for (const collected of scope.metrics) {
      const keys = byMetric.get(collected.descriptor.name) ?? new Set<string>();
      for (const point of collected.dataPoints) {
        for (const key of Object.keys(point.attributes)) keys.add(attributeKey(key));
      }
      byMetric.set(collected.descriptor.name, keys);
    }
  }
  return byMetric;
}

describe('every production dependency has something that reports it', () => {
  it('covers the dependency registry exactly, with no invented ids', () => {
    expect(unwatchedDependencies()).toEqual([]);
    const registered = new Set(PRODUCTION_DEPENDENCIES.map((dependency) => dependency.id));
    const orphans = DEPENDENCY_SIGNALS.filter((signal) => !registered.has(signal.dependency)).map(
      (signal) => signal.dependency,
    );
    expect(orphans).toEqual([]);
    const ids = DEPENDENCY_SIGNALS.map((signal) => signal.dependency);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reads each one on a dashboard that exists and shows that metric', () => {
    const byDashboard = new Map(SERVICE_DASHBOARDS.map((dashboard) => [dashboard.id, dashboard]));
    const broken: string[] = [];
    for (const signal of DEPENDENCY_SIGNALS) {
      const dashboard = byDashboard.get(signal.dashboardId);
      if (!dashboard) {
        broken.push(
          `${signal.dependency} names dashboard ${signal.dashboardId}, which does not exist`,
        );
        continue;
      }
      if (!dashboard.panels.some((panel) => panel.metric === signal.metric)) {
        broken.push(`${signal.dependency} reads ${signal.metric}, absent from ${dashboard.id}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('states why a dependency has no failure class rather than leaving it blank', () => {
    const unexplained = DEPENDENCY_SIGNALS.filter(
      (signal) => signal.failureKind === null && (signal.why ?? '').trim().length === 0,
    ).map((signal) => signal.dependency);
    expect(unexplained).toEqual([]);
  });

  it('counts a fault of each one under the kind it declares', async () => {
    const kinds = DEPENDENCY_SIGNALS.map((signal) => signal.failureKind).filter(
      (kind): kind is NonNullable<typeof kind> => kind !== null,
    );
    for (const kind of kinds) recordFailure(kind, 'unreachable');

    const { resourceMetrics } = await reader.collect();
    const seen = new Set<unknown>();
    for (const scope of resourceMetrics.scopeMetrics) {
      for (const collected of scope.metrics) {
        if (collected.descriptor.name !== METRIC_NAME.failures) continue;
        for (const point of collected.dataPoints) {
          seen.add(point.attributes[OBSERVABILITY_ATTRIBUTE.failureKind]);
        }
      }
    }
    expect([...new Set(kinds)].filter((kind) => !seen.has(kind))).toEqual([]);
  });

  it('answers for the core dependencies with a failure class, not only a config reading', () => {
    const core = PRODUCTION_DEPENDENCIES.filter(
      (dependency) => dependency.criticality === 'core',
    ).map((dependency) => dependency.id);
    const silent = core.filter((id) => dependencySignal(id)?.failureKind == null);
    expect(silent).toEqual([]);
  });
});

describe('saturation is a standing reading, not an incident report', () => {
  it('reports queue depth, oldest age and stuck leases against a panel that reads them', async () => {
    recordQueueDepth({ queue: 'digest', status: 'queued', count: 12 });
    recordQueueAge({ queue: 'digest', oldestQueuedAgeMs: 90_000, stuck: 2 });

    const emitted = await emittedLabels();
    const queueName = attributeKey(OBSERVABILITY_ATTRIBUTE.queueName);
    for (const metric of [METRIC_NAME.queueDepth, METRIC_NAME.queueAge, METRIC_NAME.queueStuck]) {
      expect(emitted.get(metric), metric).toContain(queueName);
    }
    expect(emitted.get(METRIC_NAME.queueDepth)).toContain(
      attributeKey(LOCAL_METRIC_LABEL.queueStatus),
    );
    const panels = dashboardPanels().filter(
      (panel) => panel.metric === METRIC_NAME.queueAge || panel.metric === METRIC_NAME.queueStuck,
    );
    expect(panels.length).toBeGreaterThan(0);
  });
});

describe('the span domain vocabulary describes something', () => {
  it('emits the domain on the span metric for every name it declares', async () => {
    for (const domain of SPAN_DOMAINS) {
      await withSpan(`coverage.${domain}`, { domain }, () => domain);
    }

    const emitted = await emittedLabels();
    const label = attributeKey(LOCAL_METRIC_LABEL.spanDomain);
    for (const metric of [METRIC_NAME.spanCount, METRIC_NAME.spanDuration]) {
      expect(emitted.get(metric), metric).toContain(label);
    }
    expect(METRIC_LABEL_BOUND[LOCAL_METRIC_LABEL.spanDomain]).toBeDefined();
  });

  it('accounts for every declared domain exactly once', () => {
    const accounted = SPAN_DOMAIN_EVIDENCE.map((evidence) => evidence.domain);
    expect([...accounted].sort()).toEqual([...SPAN_DOMAINS].sort());
    expect(new Set(accounted).size).toBe(accounted.length);
  });

  // A domain with neither a test nor a reason is a name that describes nothing.
  // The reasons below are today's debt; this refuses to let it grow.
  it('either cites a behavioural test that exists on disk or says why none does', () => {
    const broken: string[] = [];
    for (const evidence of SPAN_DOMAIN_EVIDENCE) {
      if (evidence.provenBy === null) {
        if ((evidence.why ?? '').trim().length === 0) {
          broken.push(`${evidence.domain} has neither a test nor a reason`);
        }
        continue;
      }
      const cited = path.join(REPO_ROOT, evidence.provenBy);
      if (!existsSync(cited)) {
        broken.push(`${evidence.domain} cites ${evidence.provenBy}, which is not a file`);
        continue;
      }
      if (!readFileSync(cited, 'utf8').includes(`'${evidence.domain}'`)) {
        broken.push(`${evidence.domain} cites ${evidence.provenBy}, which never names it`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('holds the unproven domains to the one the repository has today', () => {
    const unproven = SPAN_DOMAIN_EVIDENCE.filter((evidence) => evidence.provenBy === null).map(
      (evidence) => evidence.domain,
    );
    expect(unproven.sort()).toEqual(['billing']);
  });
});
