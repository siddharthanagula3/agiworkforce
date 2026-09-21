import { readFileSync } from 'node:fs';
import path from 'node:path';

import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CLIENT_FAILURE_CLASSES as CONTRACT_CLASSES,
  CLIENT_FAILURE_DETAILS as CONTRACT_DETAILS,
} from '@agiworkforce/types';
import {
  CLIENT_FAILURE_CLASSES as EMITTED_CLASSES,
  CLIENT_FAILURE_DETAILS as EMITTED_DETAILS,
} from '@agiworkforce/unified-chat';

import { OBSERVABILITY_ATTRIBUTE } from '../attributes';
import { labelBound, resetLabelCardinality } from '../cardinality';
import {
  CLIENT_FAILURE_CLASSES,
  CLIENT_FAILURE_DETAILS,
  type ClientFailureClass,
} from '../client-failures';
import { dashboardPanels } from '../dashboards';
import { METRIC_NAME, recordClientFailure } from '../metrics';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const EMITTER_SOURCES = [
  'packages/ui/unified-chat/src/components/ActionBar.tsx',
  'packages/ui/unified-chat/src/components/ChatInput.tsx',
  'packages/ui/unified-chat/src/components/artifact-components/ArtifactSandboxFrame.tsx',
  'packages/ui/unified-chat/src/components/markdown/HighlightedCode.tsx',
  'packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx',
  'packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx',
  'apps/web/features/chat/components/ChatConversationBoundary.tsx',
  'apps/web/features/chat/hooks/use-stream-stall-report.ts',
];

describe('the two ends of a client failure report agree on what may be said', () => {
  // Identity, not equality: a surface that restated the vocabulary instead of
  // re-exporting it would pass a value comparison and then drift.
  it('emits and ingests the one declaration of the vocabulary', () => {
    expect(EMITTED_CLASSES).toBe(CONTRACT_CLASSES);
    expect(EMITTED_DETAILS).toBe(CONTRACT_DETAILS);
    expect(CLIENT_FAILURE_CLASSES).toBe(CONTRACT_CLASSES);
    expect(CLIENT_FAILURE_DETAILS).toBe(CONTRACT_DETAILS);
  });

  it('has a product call site for every class the vocabulary names', () => {
    const sources = EMITTER_SOURCES.map((file) =>
      readFileSync(path.join(REPO_ROOT, file), 'utf8'),
    ).join('\n');
    const unemitted = CLIENT_FAILURE_CLASSES.filter(
      (failure) => !sources.includes(`failure: '${failure}'`),
    );
    expect(unemitted).toEqual([]);
  });

  it('bounds both labels to a closed set rather than a limit', () => {
    for (const [label, values] of [
      [OBSERVABILITY_ATTRIBUTE.clientFailureClass, CLIENT_FAILURE_CLASSES],
      [OBSERVABILITY_ATTRIBUTE.clientFailureDetail, CLIENT_FAILURE_DETAILS],
    ] as const) {
      const bound = labelBound(label);
      expect(bound.kind, label).toBe('enumerated');
      if (bound.kind !== 'enumerated') continue;
      expect([...bound.values].sort()).toEqual([...values].sort());
    }
  });
});

describe('what a client failure becomes on the platform', () => {
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

  async function emitted(): Promise<
    ReadonlyArray<{ name: string; attributes: ReadonlyArray<Record<string, unknown>> }>
  > {
    const { resourceMetrics } = await reader.collect();
    return resourceMetrics.scopeMetrics
      .flatMap((scope) => scope.metrics)
      .map((metric) => ({
        name: metric.descriptor.name,
        attributes: metric.dataPoints.map((point) => point.attributes as Record<string, unknown>),
      }));
  }

  it('counts the class and also the failure kind, so one panel shows it next to the rest', async () => {
    recordClientFailure({ failure: 'mermaid_render', detail: 'parse', surface: 'web' });

    const series = await emitted();
    const clientFailures = series.find((metric) => metric.name === METRIC_NAME.clientFailures);
    expect(clientFailures?.attributes[0]).toMatchObject({
      [OBSERVABILITY_ATTRIBUTE.clientFailureClass]: 'mermaid_render',
      [OBSERVABILITY_ATTRIBUTE.clientFailureDetail]: 'parse',
      [OBSERVABILITY_ATTRIBUTE.surface]: 'web',
    });
    const failures = series.find((metric) => metric.name === METRIC_NAME.failures);
    expect(failures?.attributes[0]).toMatchObject({
      [OBSERVABILITY_ATTRIBUTE.failureKind]: 'client',
    });
  });

  it('opens no series for a class a tampered client invents', async () => {
    recordClientFailure({ failure: 'not_a_real_class' as ClientFailureClass, surface: 'web' });

    const series = await emitted();
    const values = (
      series.find((metric) => metric.name === METRIC_NAME.clientFailures)?.attributes ?? []
    ).map((point) => point[OBSERVABILITY_ATTRIBUTE.clientFailureClass]);
    expect(values).not.toContain('not_a_real_class');
  });

  it('is read by a dashboard, which is the only reason to record it', () => {
    const panels = dashboardPanels().filter((panel) => panel.metric === METRIC_NAME.clientFailures);
    expect(panels.length).toBeGreaterThan(0);
  });
});
