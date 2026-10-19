import {
  CHART_KINDS,
  parseChartArtifact,
  type ChartKind,
  type ChartSpec,
} from '@agiworkforce/types';

export interface EditableChart {
  kind: ChartKind;
  title: string;
  xKey: string;
  seriesKeys: string[];
  rows: Record<string, string>[];
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
  return JSON.stringify({
    type: chart.kind,
    ...(chart.title.trim() ? { title: chart.title.trim() } : {}),
    xKey: chart.xKey,
    series: chart.seriesKeys.map((key) => ({ dataKey: key, name: key })),
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
