import { describe, expect, it } from 'vitest';
import { CHART_ROW_CAP, CHART_SERIES_CAP, parseChartArtifact, toChartNumber } from '../chart-spec';

describe('chart artifact parsing', () => {
  it('normalizes numeric cells without retaining arbitrary objects', () => {
    const parsed = parseChartArtifact(
      JSON.stringify([
        { label: 'North', revenue: ' 12.5 ', enabled: true, ignored: { value: 9 } },
        null,
        {},
      ]),
    );
    expect(parsed).toMatchObject({
      ok: true,
      spec: {
        kind: 'bar',
        xKey: 'label',
        rows: [{ label: 'North', revenue: 12.5, enabled: 'true' }],
        series: [{ dataKey: 'revenue' }],
        showLegend: false,
        totalRows: 1,
      },
    });
  });

  it('reads axis and series aliases and strips unsafe CSS colors', () => {
    expect(
      parseChartArtifact(
        JSON.stringify({
          chart_type: ' LINE ',
          values: [{ quarter: 'Q1', sales: 10, cost: 3 }],
          x_axis: { field: 'quarter', title: 'Quarter' },
          y_axis: { label: 'Amount' },
          datasets: [
            { field: 'sales', label: 'Sales', stroke: ' #abc ' },
            { key: 'cost', title: 'Cost', color: 'url(https://fixture.invalid)' },
            null,
            {},
          ],
          caption: 'Totals',
          legend: false,
        }),
      ),
    ).toEqual({
      ok: true,
      spec: {
        kind: 'line',
        rows: [{ quarter: 'Q1', sales: 10, cost: 3 }],
        xKey: 'quarter',
        series: [
          { dataKey: 'sales', name: 'Sales', color: '#abc' },
          { dataKey: 'cost', name: 'Cost', color: undefined },
        ],
        title: 'Totals',
        xLabel: 'Quarter',
        yLabel: 'Amount',
        showLegend: false,
        totalRows: 1,
      },
    });
  });

  it('uses the declared y axis or infers a numeric series when declarations cannot be plotted', () => {
    expect(
      parseChartArtifact(
        JSON.stringify({
          type: 'pie',
          data: [{ name: 'A', value: 5 }],
          yAxis: { dataKey: 'value' },
        }),
      ),
    ).toMatchObject({ ok: true, spec: { series: [{ dataKey: 'value' }], showLegend: true } });
    expect(
      parseChartArtifact(
        JSON.stringify({
          rows: [{ name: 'A', value: 5 }],
          xKey: 'missing',
          bars: ['name', 'missing', '  '],
        }),
      ),
    ).toMatchObject({ ok: true, spec: { xKey: 'name', series: [{ dataKey: 'value' }] } });
    expect(
      parseChartArtifact(JSON.stringify({ rows: [{ x: 1, y: 2 }], series: ['y'] })),
    ).toMatchObject({ ok: true, spec: { xKey: 'x', series: [{ dataKey: 'y' }] } });
  });

  it('caps rendered rows and series but preserves the usable row count', () => {
    const rows = Array.from({ length: CHART_ROW_CAP + 1 }, (_, index) => ({
      name: `row-${index}`,
      ...Object.fromEntries(
        Array.from({ length: CHART_SERIES_CAP + 1 }, (_, column) => [`value${column}`, column]),
      ),
    }));
    const result = parseChartArtifact(JSON.stringify({ data: rows }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.spec.rows).toHaveLength(CHART_ROW_CAP);
    expect(result.spec.series).toHaveLength(CHART_SERIES_CAP);
    expect(result.spec.totalRows).toBe(CHART_ROW_CAP + 1);
    expect(result.spec.rows[CHART_ROW_CAP - 1]?.['name']).toBe(`row-${CHART_ROW_CAP - 1}`);
  });

  it.each([
    '',
    '{',
    'null',
    '1',
    '{}',
    '{"type":"scatter","data":[]}',
    '{"data":[null,{}]}',
    '{"data":[{"name":"North"}]}',
  ])('refuses content that cannot represent a plot: %s', (content) => {
    expect(parseChartArtifact(content)).toMatchObject({ ok: false, reason: expect.any(String) });
  });

  it.each([
    [12, 12],
    [' 0 ', 0],
    ['1.5', 1.5],
    ['', null],
    ['  ', null],
    ['NaN', null],
    [Infinity, null],
    [null, null],
    [{}, null],
  ])('only converts finite numeric values %#', (input, expected) => {
    expect(toChartNumber(input)).toBe(expected);
  });
});
