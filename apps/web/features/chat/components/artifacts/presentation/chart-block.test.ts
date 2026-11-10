import { parseChartArtifact } from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';
import { readEditableChart, serializeChart } from './chart-block';

const WITNESS = JSON.stringify({
  type: 'bar',
  title: 'Quarterly revenue',
  xKey: 'quarter',
  xAxis: { name: 'Fiscal quarter' },
  yAxis: { name: 'USD millions' },
  showLegend: true,
  series: [{ dataKey: 'rev', name: 'Revenue', color: '#0077cc' }],
  data: [
    { quarter: 'Q1', rev: 12 },
    { quarter: 'Q2', rev: 18 },
  ],
});

function roundTrip(
  source: string,
  edit: (chart: NonNullable<ReturnType<typeof readEditableChart>>) => void,
) {
  const chart = readEditableChart(source);
  if (!chart) throw new Error('chart did not parse');
  edit(chart);
  const reparsed = parseChartArtifact(serializeChart(chart));
  if (!reparsed.ok) throw new Error(reparsed.reason);
  return reparsed.spec;
}

describe('editing a chart keeps what the editor does not own', () => {
  it('keeps axis labels, series name and colour and the legend after a cell edit', () => {
    const spec = roundTrip(WITNESS, (chart) => {
      chart.rows[1]!['rev'] = '19';
    });

    expect(spec.rows[1]).toEqual({ quarter: 'Q2', rev: 19 });
    expect(spec.xLabel).toBe('Fiscal quarter');
    expect(spec.yLabel).toBe('USD millions');
    expect(spec.series).toEqual([{ dataKey: 'rev', name: 'Revenue', color: '#0077cc' }]);
    expect(spec.showLegend).toBe(true);
  });

  it('gives the same chart back when nothing was edited', () => {
    const before = parseChartArtifact(WITNESS);
    const after = roundTrip(WITNESS, () => undefined);

    expect(before.ok && after).toEqual(before.ok && before.spec);
  });

  it('keeps a chart that hides its legend hidden', () => {
    const source = JSON.stringify({
      type: 'line',
      xKey: 'm',
      showLegend: false,
      series: [{ dataKey: 'a' }, { dataKey: 'b' }],
      data: [{ m: 'Jan', a: 1, b: 2 }],
    });

    expect(roundTrip(source, () => undefined).showLegend).toBe(false);
  });

  it('keeps a donut a donut when its rows change', () => {
    const source = JSON.stringify({
      type: 'donut',
      xKey: 'seg',
      series: [{ dataKey: 'share' }],
      data: [
        { seg: 'A', share: 40 },
        { seg: 'B', share: 60 },
      ],
    });
    const spec = roundTrip(source, (chart) => {
      chart.rows[0]!['share'] = '45';
    });

    expect(spec.kind).toBe('pie');
    expect(spec.donut).toBe(true);
  });

  it('drops the donut marker once the chart type changes', () => {
    const source = JSON.stringify({
      type: 'donut',
      xKey: 'seg',
      series: [{ dataKey: 'share' }],
      data: [{ seg: 'A', share: 40 }],
    });
    const spec = roundTrip(source, (chart) => {
      chart.kind = 'bar';
    });

    expect(spec.kind).toBe('bar');
    expect(spec.donut).toBeUndefined();
  });

  it('writes a plain chart without display settings it never had', () => {
    const source = JSON.stringify({
      type: 'bar',
      xKey: 'k',
      series: [{ dataKey: 'v' }],
      data: [{ k: 'a', v: 1 }],
    });
    const chart = readEditableChart(source)!;

    expect(JSON.parse(serializeChart(chart))).toEqual({
      type: 'bar',
      xKey: 'k',
      series: [{ dataKey: 'v', name: 'v' }],
      data: [{ k: 'a', v: 1 }],
    });
  });
});
