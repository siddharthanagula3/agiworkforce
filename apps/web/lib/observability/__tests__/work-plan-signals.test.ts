import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const emitted: Array<Record<string, unknown>> = [];

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: {
    info: (record: Record<string, unknown>) => emitted.push(record),
    error: (record: Record<string, unknown>) => emitted.push(record),
    warn: (record: Record<string, unknown>) => emitted.push(record),
    debug: (record: Record<string, unknown>) => emitted.push(record),
  },
}));

import { createWorkPlan } from '@/lib/services/work-plan-service';

import { OBSERVABILITY_ATTRIBUTE } from '../attributes';
import { resetLabelCardinality } from '../cardinality';
import { dashboardPanels } from '../dashboards';
import { METRIC_NAME } from '../metrics';

const PLAN_ID = '11111111-1111-4111-8111-111111111111';

/**
 * Enough of a database for the plan to be written: the insert answers with the
 * row it would have stored, and every later statement is a no-op.
 */
function fakeDb(): DatabaseAdapter {
  const tx = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('insert into work_plans')) {
        return [
          {
            id: PLAN_ID,
            user_id: 'usr_1',
            run_id: null,
            conversation_id: null,
            objective: 'ship it',
            constraints: null,
            deliverable: null,
            version: 1,
            status: 'draft',
          },
        ];
      }
      return [];
    }),
    execute: vi.fn(async () => undefined),
  };
  return {
    ...tx,
    transaction: vi.fn(async (fn: (handle: unknown) => Promise<unknown>) => fn(tx)),
  } as unknown as DatabaseAdapter;
}

let reader: PeriodicExportingMetricReader;
let provider: MeterProvider;

beforeEach(() => {
  emitted.length = 0;
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

describe('what planning costs and how big a plan gets', () => {
  it('times the planning itself, under the domain the Work product uses', async () => {
    await createWorkPlan(fakeDb(), {
      userId: 'usr_1',
      objective: 'ship it',
      steps: [{ description: 'first' }, { description: 'second' }],
    });

    const span = emitted.find(
      (record) => record['event'] === 'span' && record['span_name'] === 'work.plan.create',
    );
    expect(span?.['span_domain']).toBe('task');
    expect(span?.['status']).toBe('ok');
    expect(span?.['duration_ms']).toBeTypeOf('number');
    expect(span?.['agi.work.plan.status']).toBe('draft');
  });

  it('measures the steps a plan carries and the steps that finished', async () => {
    await createWorkPlan(fakeDb(), {
      userId: 'usr_1',
      objective: 'ship it',
      steps: [{ description: 'first' }, { description: 'second' }, { description: 'third' }],
    });

    const { resourceMetrics } = await reader.collect();
    const gauge = resourceMetrics.scopeMetrics
      .flatMap((scope) => scope.metrics)
      .find((metric) => metric.descriptor.name === METRIC_NAME.workPlanSteps);
    const byMeasure = new Map(
      (gauge?.dataPoints ?? []).map((point) => [
        point.attributes[OBSERVABILITY_ATTRIBUTE.workPlanMeasure],
        point.value,
      ]),
    );

    expect(byMeasure.get('steps')).toBe(3);
    expect(byMeasure.get('completed')).toBe(0);
    for (const point of gauge?.dataPoints ?? []) {
      expect(point.attributes[OBSERVABILITY_ATTRIBUTE.workPlanShape]).toBe('planned');
    }
  });

  it('is read by a dashboard, which is the only reason to record it', () => {
    const panels = dashboardPanels().filter((panel) => panel.metric === METRIC_NAME.workPlanSteps);
    expect(panels.length).toBeGreaterThan(0);
  });
});
