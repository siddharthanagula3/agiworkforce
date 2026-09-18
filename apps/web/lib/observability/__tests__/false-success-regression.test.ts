import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type DataPoint,
} from '@opentelemetry/sdk-metrics';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { METRIC_NAME, recordCompletion, recordToolOutcome, resolveCompletion } from '../metrics';
import { OBSERVABILITY_ATTRIBUTE } from '../attributes';

let reader: PeriodicExportingMetricReader;
let provider: MeterProvider;

afterAll(() => {
  metrics.disable();
});

beforeEach(() => {
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

type Point = DataPoint<unknown>;

async function points(name: string): Promise<Point[]> {
  const { resourceMetrics } = await reader.collect();
  return resourceMetrics.scopeMetrics
    .flatMap((scope) => scope.metrics)
    .filter((metric) => metric.descriptor.name === name)
    .flatMap((metric) => metric.dataPoints as Point[]);
}

describe('a reported success that is not one', () => {
  it('cannot be resolved as completed when the call carried an error', () => {
    for (const reported of ['completed', 'done', 'success', 'succeeded', 'ok', 'finished']) {
      const resolved = resolveCompletion({
        reportedStatus: reported,
        error: new Error('the tool threw'),
      });

      expect(resolved.status).toBe('failed');
      expect(resolved.falseSuccess).toBe(true);
      expect(resolved.reason).toBe('error_present');
    }
  });

  it('is failed when only an error type is carried, with no error object', () => {
    const resolved = resolveCompletion({ reportedStatus: 'done', errorType: 'mcp_transport' });

    expect(resolved.status).toBe('failed');
    expect(resolved.falseSuccess).toBe(true);
  });

  it('is failed on an error status code even when the body says done', () => {
    expect(resolveCompletion({ reportedStatus: 'done', httpStatus: 502 })).toMatchObject({
      status: 'failed',
      falseSuccess: true,
      reason: 'http_502',
    });
    expect(resolveCompletion({ reportedStatus: 'done', httpStatus: 404 }).status).toBe('failed');
  });

  it('is partial, not completed, when required output never arrived', () => {
    for (const empty of [undefined, null, '', '   ', [], {}]) {
      const resolved = resolveCompletion({
        reportedStatus: 'completed',
        output: empty,
        outputRequired: true,
      });

      expect(resolved.status).toBe('partial');
      expect(resolved.falseSuccess).toBe(true);
      expect(resolved.reason).toBe('no_output');
    }
  });

  it('does not invent a failure when the call genuinely succeeded', () => {
    expect(
      resolveCompletion({ reportedStatus: 'completed', output: 'a result', outputRequired: true }),
    ).toMatchObject({ status: 'completed', falseSuccess: false, reason: null });
    expect(resolveCompletion({ reportedStatus: 'completed', httpStatus: 200 }).status).toBe(
      'completed',
    );
  });
});

describe('infrastructure success is not semantic success', () => {
  it('a 200 response carrying an error is a failure', () => {
    expect(
      resolveCompletion({ reportedStatus: 'done', httpStatus: 200, error: 'provider refused' })
        .status,
    ).toBe('failed');
  });

  it('a status the code does not recognize never counts as a completion', () => {
    expect(resolveCompletion({ reportedStatus: 'running' })).toMatchObject({
      status: 'partial',
      reason: 'unrecognized_status',
      falseSuccess: false,
    });
  });
});

describe('cancellation is not failure', () => {
  it('stays cancelled and is not counted as a false success', () => {
    for (const reported of ['cancelled', 'canceled', 'aborted', 'stopped']) {
      const resolved = resolveCompletion({ reportedStatus: reported, error: new Error('aborted') });

      expect(resolved.status).toBe('cancelled');
      expect(resolved.falseSuccess).toBe(false);
    }
  });

  it('does not raise a tool failure', async () => {
    recordToolOutcome({ category: 'mcp', status: 'cancelled' });

    expect(await points(METRIC_NAME.failures)).toHaveLength(0);
  });
});

describe('recorded metrics', () => {
  it('counts a tool that errored as failed even though it reported Done', async () => {
    recordToolOutcome({
      category: 'mcp',
      status: 'completed',
      surface: 'web',
      error: new Error('connection reset'),
    });

    const falseSuccess = await points(METRIC_NAME.falseSuccess);
    expect(falseSuccess).toHaveLength(1);
    expect(falseSuccess[0]?.value).toBe(1);
    expect(falseSuccess[0]?.attributes[OBSERVABILITY_ATTRIBUTE.completionStatus]).toBe('failed');
    expect(falseSuccess[0]?.attributes[OBSERVABILITY_ATTRIBUTE.completionReportedStatus]).toBe(
      'completed',
    );

    const failures = await points(METRIC_NAME.failures);
    expect(
      failures.map((point) => point.attributes[OBSERVABILITY_ATTRIBUTE.failureKind]),
    ).toContain('tool');
    expect(
      failures.map((point) => point.attributes[OBSERVABILITY_ATTRIBUTE.failureKind]),
    ).toContain('mcp');
  });

  it('records no false success when nothing contradicts the reported status', async () => {
    recordToolOutcome({ category: 'web-search', status: 'completed', durationMs: 9 });

    expect(await points(METRIC_NAME.falseSuccess)).toHaveLength(0);
    const completions = await points(METRIC_NAME.completions);
    expect(completions[0]?.attributes[OBSERVABILITY_ATTRIBUTE.completionStatus]).toBe('completed');
  });

  it('keeps the existing failed path recording exactly one tool failure', async () => {
    recordToolOutcome({ category: 'connector', status: 'failed', durationMs: 5 });

    const failures = await points(METRIC_NAME.failures);
    expect(
      failures.map((point) => point.attributes[OBSERVABILITY_ATTRIBUTE.failureKind]).sort(),
    ).toEqual(['connector', 'tool']);
    expect(await points(METRIC_NAME.falseSuccess)).toHaveLength(0);
  });

  it('instruments a chat turn completion the same way a tool call is instrumented', async () => {
    recordCompletion({
      kind: 'turn',
      surface: 'web',
      evidence: { reportedStatus: 'done', output: '', outputRequired: true },
    });

    const completions = await points(METRIC_NAME.completions);
    expect(completions[0]?.attributes[OBSERVABILITY_ATTRIBUTE.completionKind]).toBe('turn');
    expect(completions[0]?.attributes[OBSERVABILITY_ATTRIBUTE.completionStatus]).toBe('partial');
    expect(completions[0]?.attributes[OBSERVABILITY_ATTRIBUTE.completionReason]).toBe('no_output');
    expect(await points(METRIC_NAME.falseSuccess)).toHaveLength(1);
  });

  it('carries the deployment that emitted the completion', async () => {
    recordCompletion({
      kind: 'task',
      surface: 'worker',
      evidence: { reportedStatus: 'completed' },
    });

    const completions = await points(METRIC_NAME.completions);
    expect(completions[0]?.attributes[OBSERVABILITY_ATTRIBUTE.surface]).toBe('worker');
  });
});
