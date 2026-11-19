import {
  CHART_KINDS,
  parseChartArtifact,
  type ChartKind,
  type ChartSpec,
} from '@agiworkforce/types';

export interface ChartDisplay {
  xLabel?: string;
  yLabel?: string;
  donut?: true;
  showLegend?: boolean;
  series: Record<string, { name?: string; color?: string }>;
}

export interface EditableChart {
  kind: ChartKind;
  title: string;
  xKey: string;
  seriesKeys: string[];
  rows: Record<string, string>[];
  display?: ChartDisplay;
}

function defaultLegend(kind: ChartKind, seriesCount: number): boolean {
  return seriesCount > 1 || kind === 'pie';
}

export const STARTER_CHART: EditableChart = {
  kind: 'bar',
  title: 'Results',
  xKey: 'label',
  seriesKeys: ['value'],
  rows: [
    { label: 'Q1', value: '12' },
    { label: 'Q2', value: '18' },
    { label: 'Q3', value: '15' },
    { label: 'Q4', value: '22' },
  ],
};

export function chartFromSpec(spec: ChartSpec): EditableChart {
  const seriesKeys = spec.series.map((series) => series.dataKey);
  return {
    kind: spec.kind,
    title: spec.title ?? '',
    xKey: spec.xKey,
    seriesKeys,
    rows: spec.rows.map((row) =>
      Object.fromEntries([spec.xKey, ...seriesKeys].map((key) => [key, String(row[key] ?? '')])),
    ),
    display: {
      ...(spec.xLabel ? { xLabel: spec.xLabel } : {}),
      ...(spec.yLabel ? { yLabel: spec.yLabel } : {}),
      ...(spec.donut ? { donut: true as const } : {}),
      ...(spec.showLegend !== defaultLegend(spec.kind, spec.series.length)
        ? { showLegend: spec.showLegend }
        : {}),
      series: Object.fromEntries(
        spec.series.map((series) => [
          series.dataKey,
          {
            ...(series.name ? { name: series.name } : {}),
            ...(series.color ? { color: series.color } : {}),
          },
        ]),
      ),
    },
  };
}

export function readEditableChart(source: string): EditableChart | null {
  const parsed = parseChartArtifact(source);
  return parsed.ok ? chartFromSpec(parsed.spec) : null;
}

export function isChartKind(value: string): value is ChartKind {
  return (CHART_KINDS as readonly string[]).includes(value);
}

function cell(value: string): string | number {
  const trimmed = value.trim();
  const number = Number(trimmed.replace(/,/g, ''));
  return trimmed !== '' && Number.isFinite(number) ? number : trimmed;
}

export function serializeChart(chart: EditableChart): string {
  const display = chart.display;
  return JSON.stringify({
    type: chart.kind === 'pie' && display?.donut ? 'donut' : chart.kind,
    ...(chart.title.trim() ? { title: chart.title.trim() } : {}),
    xKey: chart.xKey,
    ...(display?.xLabel ? { xAxis: { name: display.xLabel } } : {}),
    ...(display?.yLabel ? { yAxis: { name: display.yLabel } } : {}),
    ...(display?.showLegend === undefined ? {} : { showLegend: display.showLegend }),
    series: chart.seriesKeys.map((key) => ({
      dataKey: key,
      name: display?.series[key]?.name ?? key,
      ...(display?.series[key]?.color ? { color: display.series[key]?.color } : {}),
    })),
    data: chart.rows
      .filter((row) => (row[chart.xKey] ?? '').trim() !== '')
      .map((row) =>
        Object.fromEntries(
          [chart.xKey, ...chart.seriesKeys].map((key) => [
            key,
            key === chart.xKey ? (row[key] ?? '').trim() : cell(row[key] ?? ''),
          ]),
        ),
      ),
  });
}

export function chartFence(chart: EditableChart): string {
  return ['```chart', serializeChart(chart), '```'].join('\n');
}
