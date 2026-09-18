import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { settleAutomationAttempt, startAutomationAttempt } from '@agiworkforce/types';
import {
  AUTOMATION_ATTRIBUTE,
  AUTOMATION_METRIC_NAME,
  automationRunDiagnostics,
  recordAutomationOutcome,
  recordAutomationOutcomes,
  resetAutomationInstrumentCache,
} from './automation-telemetry';
import { resetDeploymentAttributesCache } from './attributes';

let reader: PeriodicExportingMetricReader;
let provider: MeterProvider;
let exporter: InMemoryMetricExporter;

afterAll(() => {
  metrics.disable();
});

beforeEach(() => {
  metrics.disable();
  resetAutomationInstrumentCache();
  resetDeploymentAttributesCache();
  exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
  provider = new MeterProvider({ readers: [reader] });
  metrics.setGlobalMeterProvider(provider);
});

afterEach(async () => {
  await provider.shutdown();
  metrics.disable();
});

function attempt(runId = 'run_1') {
  return startAutomationAttempt({
    runId,
    action: 'browser.click',
    surface: 'desktop',
    deviceId: 'device_1',
    sessionKind: 'built-in',
    startedAtMs: 1_000,
  });
}

async function collected() {
  await reader.forceFlush();
  return exporter
    .getMetrics()
    .flatMap((resource) => resource.scopeMetrics)
    .flatMap((scope) => scope.metrics);
}

function series(name: string, all: Awaited<ReturnType<typeof collected>>) {
  return all.find((metric) => metric.descriptor.name === name);
}

describe('automation outcomes reach the metrics pipeline', () => {
  it('counts every settled outcome with its status and session', async () => {
    recordAutomationOutcome(
      settleAutomationAttempt(
        attempt(),
        { claim: 'succeeded', verification: { check: 'the page changed', passed: true } },
        1_600,
      ),
    );

    const all = await collected();
    const outcomes = series(AUTOMATION_METRIC_NAME.outcomes, all);
    expect(outcomes?.dataPoints).toHaveLength(1);
    const point = outcomes?.dataPoints[0];
    expect(point?.value).toBe(1);
    expect(point?.attributes[AUTOMATION_ATTRIBUTE.status]).toBe('succeeded');
    expect(point?.attributes[AUTOMATION_ATTRIBUTE.session]).toBe('built-in');
    expect(point?.attributes[AUTOMATION_ATTRIBUTE.verified]).toBe(true);
    expect(series(AUTOMATION_METRIC_NAME.outcomeDuration, all)?.dataPoints[0]?.value).toMatchObject(
      { count: 1 },
    );
  });

  it('counts an unverified success claim on its own series', async () => {
    recordAutomationOutcome(
      settleAutomationAttempt(attempt(), {
        claim: 'succeeded',
        verification: { check: 'nothing was looked at', passed: false },
      }),
    );

    const unverified = series(AUTOMATION_METRIC_NAME.unverified, await collected());
    expect(unverified?.dataPoints[0]?.value).toBe(1);
  });

  it('leaves a refusal out of the unverified series', async () => {
    recordAutomationOutcomes([
      settleAutomationAttempt(attempt(), { claim: 'refused', reason: 'site not approved' }),
    ]);

    const all = await collected();
    expect(series(AUTOMATION_METRIC_NAME.unverified, all)).toBeUndefined();
    expect(series(AUTOMATION_METRIC_NAME.outcomes, all)?.dataPoints[0]?.attributes).toMatchObject({
      [AUTOMATION_ATTRIBUTE.status]: 'refused',
    });
  });

  it('keeps the run and device ids out of the metric attributes', async () => {
    recordAutomationOutcome(
      settleAutomationAttempt(attempt(), { claim: 'failed', reason: 'timeout' }),
    );

    const attributes = series(AUTOMATION_METRIC_NAME.outcomes, await collected())?.dataPoints[0]
      ?.attributes;
    expect(JSON.stringify(attributes)).not.toContain('run_1');
    expect(JSON.stringify(attributes)).not.toContain('device_1');
  });
});

describe('support diagnostics for one run', () => {
  it('summarizes the run and names the last thing that stopped it', () => {
    const diagnostics = automationRunDiagnostics('run_1', [
      settleAutomationAttempt(
        attempt(),
        { claim: 'succeeded', verification: { check: 'the page changed', passed: true } },
        1_500,
      ),
      settleAutomationAttempt(attempt(), { claim: 'failed', reason: 'the button never appeared' }),
    ]);

    expect(diagnostics.deviceId).toBe('device_1');
    expect(diagnostics.summary).toMatchObject({ total: 2, succeeded: 1, failed: 1 });
    expect(diagnostics.summary.successRate).toBe(0.5);
    expect(diagnostics.lastFailureReason).toBe('the button never appeared');
  });

  it('says nothing failed when nothing failed', () => {
    const diagnostics = automationRunDiagnostics('run_1', []);
    expect(diagnostics.lastFailureReason).toBeNull();
    expect(diagnostics.deviceId).toBeNull();
  });
});
