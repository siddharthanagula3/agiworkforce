import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { ChartArtifact } from '../ChartArtifact';
import {
  CHART_ROW_CAP,
  CHART_SERIES_CAP,
  chartSeriesPalette,
  parseChartArtifact,
  toChartNumber,
} from '../chart-spec';
import { ArtifactRenderer } from '../../ArtifactRenderer';
import type { Artifact } from '../../../lib/types';

function chartArtifact(content: string): Artifact {
  return { id: 'chart-1', type: 'chart', title: 'Revenue', content };
}

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

describe('parseChartArtifact', () => {
  it('reads the desktop-native chart spec', () => {
    const result = parseChartArtifact(
      JSON.stringify({
        type: 'bar',
        xKey: 'month',
        bars: [{ dataKey: 'revenue', name: 'Revenue' }],
        data: [
          { month: 'Jan', revenue: 10 },
          { month: 'Feb', revenue: 20 },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.kind).toBe('bar');
    expect(result.spec.xKey).toBe('month');
    expect(result.spec.series).toEqual([{ dataKey: 'revenue', name: 'Revenue', color: undefined }]);
    expect(result.spec.rows).toHaveLength(2);
  });

  it('honours the typed ChartRenderData axis declaration instead of guessing', () => {
    const result = parseChartArtifact(
      JSON.stringify({
        chart_type: 'bar',
        x_axis: { label: 'Year', data_key: 'year' },
        series: [{ data_key: 'revenue' }],
        show_legend: false,
        data: [
          { revenue: 10, year: 2020 },
          { revenue: 20, year: 2021 },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.xKey).toBe('year');
    expect(result.spec.series.map((entry) => entry.dataKey)).toEqual(['revenue']);
    expect(result.spec.showLegend).toBe(false);
  });

  it('falls back to the declared y axis when no series array is given', () => {
    const result = parseChartArtifact(
      JSON.stringify({
        chart_type: 'line',
        x_axis: { data_key: 'year' },
        y_axis: { data_key: 'revenue' },
        data: [
          { revenue: 10, year: 2020 },
          { revenue: 20, year: 2021 },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.xKey).toBe('year');
    expect(result.spec.series.map((entry) => entry.dataKey)).toEqual(['revenue']);
  });

  it('never plots the x key as a series', () => {
    const result = parseChartArtifact(
      JSON.stringify({
        x_axis: { data_key: 'year' },
        series: [{ data_key: 'year' }, { data_key: 'revenue' }],
        data: [{ revenue: 10, year: 2020 }],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.series.map((entry) => entry.dataKey)).toEqual(['revenue']);
  });

  it('defaults to a bar chart and infers numeric series and the x key', () => {
    const result = parseChartArtifact(
      JSON.stringify({ data: [{ name: 'A', value: 1, other: 2 }] }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.kind).toBe('bar');
    expect(result.spec.xKey).toBe('name');
    expect(result.spec.series.map((s) => s.dataKey)).toEqual(['value', 'other']);
  });

  it('accepts a bare array of rows', () => {
    const result = parseChartArtifact(JSON.stringify([{ name: 'A', value: 1 }]));
    expect(result.ok).toBe(true);
  });

  it('coerces numeric strings so they plot', () => {
    const result = parseChartArtifact(
      JSON.stringify({ data: [{ name: 'A', value: '12.5' }], lines: [{ key: 'value' }] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.rows[0]!['value']).toBe(12.5);
  });

  it('drops nested values instead of handing recharts an object', () => {
    const result = parseChartArtifact(
      JSON.stringify({ data: [{ name: 'A', value: 1, meta: { nested: true }, list: [1, 2] }] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.spec.rows[0]!)).toEqual(['name', 'value']);
  });

  it('rejects a colour that is not plain colour syntax', () => {
    const result = parseChartArtifact(
      JSON.stringify({
        data: [{ name: 'A', value: 1 }],
        series: [{ dataKey: 'value', color: 'url(#evil)' }],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.series[0]!.color).toBeUndefined();
  });

  it('keeps a well-formed colour', () => {
    const result = parseChartArtifact(
      JSON.stringify({
        data: [{ name: 'A', value: 1 }],
        series: [{ dataKey: 'value', color: '#ff0000' }],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.series[0]!.color).toBe('#ff0000');
  });

  it('caps rows and series', () => {
    const rows = Array.from({ length: CHART_ROW_CAP + 25 }, (_, i) => ({
      name: `p${i}`,
      value: i,
    }));
    const wide = Object.fromEntries(
      Array.from({ length: CHART_SERIES_CAP + 5 }, (_, i) => [`s${i}`, i]),
    );

    const capped = parseChartArtifact(JSON.stringify({ data: rows }));
    expect(capped.ok).toBe(true);
    if (capped.ok) {
      expect(capped.spec.rows).toHaveLength(CHART_ROW_CAP);
      expect(capped.spec.totalRows).toBe(CHART_ROW_CAP + 25);
    }

    const narrowed = parseChartArtifact(
      JSON.stringify({ xKey: 'name', data: [{ name: 'A', ...wide }] }),
    );
    expect(narrowed.ok).toBe(true);
    if (narrowed.ok) expect(narrowed.spec.series).toHaveLength(CHART_SERIES_CAP);
  });

  it('degrades with a readable reason for every malformed shape', () => {
    const cases: Array<[string, RegExp]> = [
      ['', /no content/i],
      ['not json at all', /not valid JSON/i],
      ['"just a string"', /not a chart definition/i],
      [
        JSON.stringify({ type: 'radar', data: [{ name: 'A', value: 1 }] }),
        /Unsupported chart type/i,
      ],
      [JSON.stringify({ type: 'bar' }), /no data array/i],
      [JSON.stringify({ data: ['a', 'b'] }), /no usable data rows/i],
      [JSON.stringify({ data: [{ name: 'A', label: 'B' }] }), /no numeric series/i],
    ];

    for (const [content, reason] of cases) {
      const result = parseChartArtifact(content);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(reason);
    }
  });

  it('drops a literal __proto__ payload instead of polluting Object.prototype', () => {
    // Hand-written JSON: an object literal would set the prototype at author
    // time, so JSON.stringify could never carry the key into the parser.
    const payload = '{"type":"bar","data":[{"__proto__":{"polluted":true},"name":"A","value":1}]}';
    expect(Object.keys(JSON.parse(payload).data[0])).toContain('__proto__');

    const result = parseChartArtifact(payload);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.spec.rows[0]!)).toEqual(['name', 'value']);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect('polluted' in Object.prototype).toBe(false);
  });

  it('never throws on hostile input', () => {
    const hostile = [
      '{"data":[{"__proto__":"injected","name":"A","value":1}]}',
      JSON.stringify({ type: { nested: true }, data: [{ name: 'A', value: 1 }] }),
      JSON.stringify({ data: [{ name: 'A', value: Number.MAX_VALUE }] }),
      JSON.stringify({ data: [null, 1, [], { name: 'A', value: 1 }] }),
      JSON.stringify({ x_axis: 'not an object', data: [{ name: 'A', value: 1 }] }),
    ];
    for (const content of hostile) {
      expect(() => parseChartArtifact(content)).not.toThrow();
    }
  });
});

describe('toChartNumber', () => {
  it('keeps finite numbers and rejects the rest', () => {
    expect(toChartNumber(3)).toBe(3);
    expect(toChartNumber('4')).toBe(4);
    expect(toChartNumber(Number.NaN)).toBeNull();
    expect(toChartNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toChartNumber('')).toBeNull();
    expect(toChartNumber('abc')).toBeNull();
    expect(toChartNumber(null)).toBeNull();
  });
});

describe('chartSeriesPalette', () => {
  it('gives a distinct token-derived ramp per theme', () => {
    const light = chartSeriesPalette('light');
    const dark = chartSeriesPalette('dark');

    expect(new Set(light).size).toBe(light.length);
    expect(dark.length).toBe(light.length);
    expect(light.every((color) => color.startsWith('#'))).toBe(true);
    expect(dark).not.toEqual(light);
  });

  it('has a colour for every series the parser admits', () => {
    expect(chartSeriesPalette('light').length).toBeGreaterThanOrEqual(CHART_SERIES_CAP);
    expect(chartSeriesPalette('dark').length).toBeGreaterThanOrEqual(CHART_SERIES_CAP);
  });
});

describe('ChartArtifact', () => {
  it('renders chart chrome for a valid spec', () => {
    render(
      <ChartArtifact
        artifact={chartArtifact(JSON.stringify({ type: 'line', data: [{ name: 'A', value: 1 }] }))}
      />,
    );

    const chart = screen.getByTestId('chart-artifact');
    expect(chart.getAttribute('data-chart-kind')).toBe('line');
    expect(screen.getByText(/1 point/)).toBeDefined();
    expect(screen.queryByTestId('chart-artifact-fallback')).toBeNull();
  });

  it('shows the readable fallback with the raw content instead of throwing', () => {
    render(<ChartArtifact artifact={chartArtifact('{ oops')} />);

    expect(screen.getByTestId('chart-artifact-fallback')).toBeDefined();
    expect(screen.getByText(/not valid JSON/i)).toBeDefined();
    expect(screen.getByText('{ oops')).toBeDefined();
  });

  it('notes truncation honestly when the data exceeds the cap', () => {
    const rows = Array.from({ length: CHART_ROW_CAP + 1 }, (_, i) => ({ name: `p${i}`, value: i }));
    render(<ChartArtifact artifact={chartArtifact(JSON.stringify({ data: rows }))} />);

    expect(screen.getByTestId('chart-truncation-note').textContent).toContain(
      String(CHART_ROW_CAP + 1),
    );
  });

  it('recovers when streamed content becomes valid after a broken frame', () => {
    const { rerender } = render(<ChartArtifact artifact={chartArtifact('{"type":"bar","dat')} />);
    expect(screen.getByTestId('chart-artifact-fallback')).toBeDefined();

    rerender(
      <ChartArtifact
        artifact={chartArtifact(JSON.stringify({ type: 'bar', data: [{ name: 'A', value: 1 }] }))}
      />,
    );

    expect(screen.getByTestId('chart-artifact')).toBeDefined();
    expect(screen.queryByTestId('chart-artifact-fallback')).toBeNull();
  });
});

describe('ArtifactRenderer chart routing', () => {
  it('renders chart artifacts instead of the unsupported-type message', () => {
    render(
      <ArtifactRenderer
        artifact={chartArtifact(JSON.stringify({ type: 'pie', data: [{ name: 'A', value: 1 }] }))}
      />,
    );

    expect(screen.getByTestId('chart-artifact')).toBeDefined();
    expect(screen.queryByText(/Unsupported artifact type/)).toBeNull();
  });
});
