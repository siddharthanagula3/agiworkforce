import { parseChartArtifact } from '@agiworkforce/types';
import type { MermaidChart } from './mermaidChart';

const MAX_CHART_CATEGORIES = 40;
const MAX_PIE_SLICES = 12;

export function chartArtifactToChart(content: string): MermaidChart | null {
  const parsed = parseChartArtifact(content);
  if (!parsed.ok) return null;
  const { spec } = parsed;
  const category = (value: string | number | undefined) =>
    value === undefined ? '' : String(value);
  const valueOf = (value: string | number | undefined) => (typeof value === 'number' ? value : 0);
  if (spec.kind === 'pie') {
    const first = spec.series[0];
    if (!first) return null;
    return {
      kind: 'pie',
      ...(spec.title ? { title: spec.title } : {}),
      slices: spec.rows.slice(0, MAX_PIE_SLICES).map((row) => ({
        label: category(row[spec.xKey]),
        value: valueOf(row[first.dataKey]),
      })),
    };
  }
  const rows = spec.rows.slice(0, MAX_CHART_CATEGORIES);
  return {
    kind: 'xy',
    ...(spec.title ? { title: spec.title } : {}),
    ...(spec.yLabel ? { yLabel: spec.yLabel } : {}),
    categories: rows.map((row) => category(row[spec.xKey])),
    series: spec.series.map((entry) => ({
      type: spec.kind === 'line' ? ('line' as const) : ('bar' as const),
      name: entry.name ?? entry.dataKey,
      values: rows.map((row) => valueOf(row[entry.dataKey])),
    })),
  };
}
