import { parseChartArtifact, type ChartCellValue, type ChartSpec } from '@agiworkforce/types';
import type { AssistantFence } from '@agiworkforce/unified-chat/assistant-fence';
import type { MermaidChart } from './mermaidChart';

type ChartFence = Extract<AssistantFence, { kind: 'chart' }>;

export type ChartArtifactReading =
  { ok: true; chart: MermaidChart; spec: ChartSpec } | { ok: false; reason: string };

function category(value: ChartCellValue | undefined): string {
  return value === undefined ? '' : String(value);
}

function numberOrGap(value: ChartCellValue | undefined): number | null {
  return typeof value === 'number' ? value : null;
}

export function chartSpecToChart(spec: ChartSpec): MermaidChart {
  const categoryHeader = spec.xLabel ?? spec.xKey;
  if (spec.kind === 'pie') {
    const first = spec.series[0];
    return {
      kind: 'pie',
      ...(spec.title ? { title: spec.title } : {}),
      categoryHeader,
      ...(first ? { valueHeader: first.name ?? first.dataKey } : {}),
      ...(spec.donut ? { donut: true } : {}),
      showLegend: spec.showLegend,
      totalRows: spec.totalRows,
      slices: first
        ? spec.rows.flatMap((row) => {
            const value = row[first.dataKey];
            return typeof value === 'number' ? [{ label: category(row[spec.xKey]), value }] : [];
          })
        : [],
    };
  }
  return {
    kind: 'xy',
    ...(spec.title ? { title: spec.title } : {}),
    categoryHeader,
    ...(spec.xLabel ? { xLabel: spec.xLabel } : {}),
    ...(spec.yLabel ? { yLabel: spec.yLabel } : {}),
    showLegend: spec.showLegend,
    totalRows: spec.totalRows,
    categories: spec.rows.map((row) => category(row[spec.xKey])),
    series: spec.series.map((entry) => ({
      type: spec.kind === 'line' ? ('line' as const) : ('bar' as const),
      name: entry.name ?? entry.dataKey,
      ...(entry.color ? { color: entry.color } : {}),
      values: spec.rows.map((row) => numberOrGap(row[entry.dataKey])),
    })),
  };
}

export function readChartArtifact(content: string): ChartArtifactReading {
  const parsed = parseChartArtifact(content);
  if (!parsed.ok) return parsed;
  return { ok: true, chart: chartSpecToChart(parsed.spec), spec: parsed.spec };
}

export function chartArtifactToChart(content: string): MermaidChart | null {
  const reading = readChartArtifact(content);
  return reading.ok ? reading.chart : null;
}

export function chartFromAssistantFence(fence: ChartFence): MermaidChart {
  if (fence.spec) return chartSpecToChart(fence.spec);
  const title = fence.title ? { title: fence.title } : {};
  if (fence.chartKind === 'pie' || fence.chartKind === 'donut') {
    return {
      kind: 'pie',
      ...title,
      categoryHeader: fence.xLabel,
      valueHeader: fence.yLabel,
      ...(fence.chartKind === 'donut' ? { donut: true } : {}),
      slices: fence.points.map((point) => ({ label: point.label, value: point.value })),
    };
  }
  return {
    kind: 'xy',
    ...title,
    categoryHeader: fence.xLabel,
    ...(fence.xLabel ? { xLabel: fence.xLabel } : {}),
    ...(fence.yLabel ? { yLabel: fence.yLabel } : {}),
    categories: fence.points.map((point) => point.label),
    series: [
      {
        type: fence.chartKind === 'line' ? 'line' : 'bar',
        ...(fence.yLabel ? { name: fence.yLabel } : {}),
        values: fence.points.map((point) => point.value),
      },
    ],
  };
}
