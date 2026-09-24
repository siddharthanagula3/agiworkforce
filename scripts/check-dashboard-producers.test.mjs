import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  OBSERVABILITY_DIR,
  readInstrumentTable,
  readPanelMetrics,
  readRecorders,
  runDashboardProducerCheck,
} from './check-dashboard-producers.mjs';

const METRICS = `
export const METRIC_NAME = {
  turns: 'agi.turns',
  queueDepth: 'agi.queue.depth',
} as const;

function instruments() {
  const meter = provider.getMeter(TRACER_NAME);
  return {
    turns: meter.createCounter(METRIC_NAME.turns),
    depth: meter.createGauge(METRIC_NAME.queueDepth),
  };
}

export function recordTurnOutcome(input: { outcome: string }): void {
  const recorded = instruments();
  recorded.turns.add(1, clean({ outcome: input.outcome }));
}

export function recordQueueDepth(input: { count: number }): void {
  instruments().depth.record(input.count, clean({}));
}
`;

const SPAN = `
import { recordTurnOutcome } from './metrics';

export async function withTurn<R>(name: string, run: () => Promise<R>): Promise<R> {
  const result = await run();
  recordTurnOutcome({ outcome: 'succeeded' });
  return result;
}
`;

const DASHBOARDS = `
export const SERVICE_DASHBOARDS = [
  {
    id: 'turn-latency-and-cost',
    panels: [
      { id: 'turn-rate', title: 'Turns', metric: METRIC_NAME.turns, aggregation: 'rate' },
    ],
  },
] as const;
`;

const PRODUCT = `
import { withTurn } from '@/lib/observability/span';

export async function serveTurn(): Promise<void> {
  await withTurn<void>('chat', async () => undefined);
}
`;

function fixture(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-producers-'));
  const observability = path.join(root, OBSERVABILITY_DIR);
  fs.mkdirSync(observability, { recursive: true });
  fs.mkdirSync(path.join(root, 'apps/web/lib/server'), { recursive: true });
  fs.writeFileSync(path.join(observability, 'metrics.ts'), overrides.metrics ?? METRICS);
  fs.writeFileSync(path.join(observability, 'span.ts'), overrides.span ?? SPAN);
  fs.writeFileSync(path.join(observability, 'dashboards.ts'), overrides.dashboards ?? DASHBOARDS);
  fs.writeFileSync(
    path.join(root, 'apps/web/lib/server/turn-service.ts'),
    overrides.product ?? PRODUCT,
  );
  return root;
}

test('a charted metric a product call site reaches through a wrapper passes', () => {
  assert.deepEqual(runDashboardProducerCheck(fixture()), []);
});

test('the instrument table and the panels are read from the source, not assumed', () => {
  const root = fixture();
  assert.equal(readInstrumentTable(root).get('METRIC_NAME.turns'), 'agi.turns');
  assert.ok(readPanelMetrics(root).has('METRIC_NAME.turns'));
  assert.ok(readRecorders(root).get('withTurn').has('agi.turns'));
});

test('a panel whose recorder nothing in the app calls fails', () => {
  const failures = runDashboardProducerCheck(
    fixture({ product: 'export function serveTurn(): void {}\n' }),
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /agi\.turns is on a dashboard and nothing under/u);
  assert.match(failures[0], /recordTurnOutcome/u);
});

test('a panel reading a metric no function records fails', () => {
  const failures = runDashboardProducerCheck(
    fixture({
      dashboards: DASHBOARDS.replace('METRIC_NAME.turns', 'METRIC_NAME.queueDepth').replace(
        "id: 'turn-rate'",
        "id: 'depth'",
      ),
      metrics: METRICS.replace(
        `export function recordQueueDepth(input: { count: number }): void {
  instruments().depth.record(input.count, clean({}));
}`,
        '',
      ),
    }),
  );
  assert.ok(failures.some((failure) => /agi\.queue\.depth is on a dashboard/u.test(failure)));
});

test('a panel naming a metric no table declares fails', () => {
  const failures = runDashboardProducerCheck(
    fixture({ dashboards: DASHBOARDS.replace('METRIC_NAME.turns', 'METRIC_NAME.invented') }),
  );
  assert.deepEqual(failures, [
    'a panel reads METRIC_NAME.invented, which no instrument table declares',
  ]);
});

test('a metric nothing records and no panel reads fails', () => {
  const failures = runDashboardProducerCheck(
    fixture({
      metrics: METRICS.replace(
        `export function recordQueueDepth(input: { count: number }): void {
  instruments().depth.record(input.count, clean({}));
}`,
        '',
      ),
    }),
  );
  assert.deepEqual(failures, [
    'agi.queue.depth is declared, recorded by nothing and read by no panel',
  ]);
});

test('a second instrument table is resolved through its own name', () => {
  const root = fixture({
    metrics: `${METRICS}
export const MEDIA_METRIC_NAME = {
  generations: 'agi.media.generations',
} as const;

function mediaInstruments() {
  const meter = provider.getMeter(TRACER_NAME);
  return { generations: meter.createCounter(MEDIA_METRIC_NAME.generations) };
}

export function recordMediaGeneration(input: { media: string }): void {
  const recorded = mediaInstruments();
  recorded.generations.add(1, clean({ media: input.media }));
}
`,
    dashboards: DASHBOARDS.replace(
      "{ id: 'turn-rate', title: 'Turns', metric: METRIC_NAME.turns, aggregation: 'rate' },",
      `{ id: 'turn-rate', title: 'Turns', metric: METRIC_NAME.turns, aggregation: 'rate' },
      { id: 'media', title: 'Media', metric: MEDIA_METRIC_NAME.generations, aggregation: 'rate' },`,
    ),
    product: `${PRODUCT}
import { recordMediaGeneration } from '@/lib/observability/metrics';

export function serveMedia(): void {
  recordMediaGeneration({ media: 'video' });
}
`,
  });
  assert.deepEqual(runDashboardProducerCheck(root), []);
});
