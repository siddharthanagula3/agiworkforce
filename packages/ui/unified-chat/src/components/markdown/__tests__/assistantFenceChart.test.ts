import { describe, expect, it } from 'vitest';

import { chartSpecFromFence, classifyAssistantFence } from '../assistantFence';

const REVENUE_AND_COST = JSON.stringify({
  type: 'line',
  title: 'Margin',
  xKey: 'month',
  series: [
    { dataKey: 'revenue', name: 'Revenue', color: '#dc2626' },
    { dataKey: 'cost', name: 'Cost' },
  ],
  data: [
    { month: 'Jan', revenue: 10, cost: 4 },
    { month: 'Feb', revenue: 12, cost: 5 },
  ],
});

describe('chart fences keep their type and every series', () => {
  it.each(['bar', 'line', 'pie', 'donut'] as const)(
    'reports a %s chart written as label and value lines with its kind',
    (kind) => {
      expect(classifyAssistantFence('chart', `type: ${kind}\nJan | 10\nFeb | 20`)).toMatchObject({
        kind: 'chart',
        chartKind: kind,
        spec: null,
      });
    },
  );

  it('carries the full definition so every series can be plotted', () => {
    const fence = classifyAssistantFence('chart', REVENUE_AND_COST);
    if (fence.kind !== 'chart') throw new Error('expected a chart');

    expect(fence.chartKind).toBe('line');
    expect(fence.spec?.series).toEqual([
      { dataKey: 'revenue', name: 'Revenue', color: '#dc2626' },
      { dataKey: 'cost', name: 'Cost', color: undefined },
    ]);
    expect(fence.points).toEqual([
      { label: 'Jan', value: 10 },
      { label: 'Feb', value: 12 },
    ]);
  });

  it('names a doughnut definition a donut', () => {
    const fence = classifyAssistantFence(
      'chart',
      JSON.stringify({ type: 'doughnut', data: [{ name: 'A', value: 3 }] }),
    );
    expect(fence).toMatchObject({ kind: 'chart', chartKind: 'donut' });
  });

  it('reads a JSON fence that names a chart type as a chart definition', () => {
    const spec = chartSpecFromFence(
      'json',
      '{"type":"bar","data":[{"name":"Jan","value":3},{"name":"Feb","value":5}]}',
    );
    expect(spec).toMatchObject({ kind: 'bar', xKey: 'name', series: [{ dataKey: 'value' }] });
    expect(spec?.rows).toHaveLength(2);
  });

  it('leaves ordinary JSON, other languages and broken charts alone', () => {
    expect(chartSpecFromFence('json', '{"name":"Ada","value":3}')).toBeNull();
    expect(chartSpecFromFence('json', '{"type":"bar","data":')).toBeNull();
    expect(chartSpecFromFence('ts', '{"type":"bar","data":[{"name":"a","value":1}]}')).toBeNull();
    expect(
      classifyAssistantFence('json', '{"type":"bar","data":[{"name":"a","value":1}]}'),
    ).toEqual(expect.objectContaining({ kind: 'code' }));
  });
});
