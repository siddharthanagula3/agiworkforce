import { agiPalette, type AgiThemeMode } from '@agiworkforce/design-tokens';
import { translateUiPlural } from '@agiworkforce/ui';
import type { ChartCellValue, ChartSeriesSpec, ChartSpec } from '@agiworkforce/types';

export {
  CHART_KINDS,
  CHART_ROW_CAP,
  CHART_SERIES_CAP,
  parseChartArtifact,
  toChartNumber,
} from '@agiworkforce/types';
export type {
  ChartCellValue,
  ChartKind,
  ChartParseResult,
  ChartRow,
  ChartSeriesSpec,
  ChartSpec,
} from '@agiworkforce/types';

const HEX_SHORTHAND_LENGTH = 3;
const HEX_CHANNEL_OFFSETS = [0, 2, 4] as const;
const HEX_CHANNEL_WIDTH = 2;
const HEX_RADIX = 16;
const CHANNEL_MAX = 255;
const SERIES_SHADE_RATIO = 0.45;

const HEX_RE = /^[0-9a-f]{6}$/i;

export interface ChartChrome {
  grid: string;
  axis: string;
  label: string;
  surface: string;
  border: string;
  text: string;
  hover: string;
}

function parseHexChannels(value: string): number[] | null {
  const hex = value.trim().replace('#', '');
  const full =
    hex.length === HEX_SHORTHAND_LENGTH
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex;
  if (!HEX_RE.test(full)) return null;
  return HEX_CHANNEL_OFFSETS.map((offset) =>
    parseInt(full.slice(offset, offset + HEX_CHANNEL_WIDTH), HEX_RADIX),
  );
}

function toHexColor(channels: number[]): string {
  return `#${channels
    .map((channel) =>
      Math.max(0, Math.min(CHANNEL_MAX, channel))
        .toString(HEX_RADIX)
        .padStart(HEX_CHANNEL_WIDTH, '0'),
    )
    .join('')}`;
}

function mixColor(from: string, to: string, ratio: number): string {
  const a = parseHexChannels(from);
  const b = parseHexChannels(to);
  if (!a || !b) return from;
  return toHexColor(a.map((channel, index) => Math.round(channel + (b[index]! - channel) * ratio)));
}

/** Long enough that every series the parser admits gets its own colour. */
export function chartSeriesPalette(mode: AgiThemeMode): readonly string[] {
  const tokens = agiPalette[mode];
  const base = [
    tokens.accent.primary,
    tokens.accent.secondary,
    tokens.state.info,
    tokens.state.success,
    tokens.state.warning,
    tokens.state.danger,
    tokens.accent.secondarySoft,
  ];
  return [
    ...base,
    ...base.map((color) => mixColor(color, tokens.text.primary, SERIES_SHADE_RATIO)),
  ];
}

export function chartChrome(mode: AgiThemeMode): ChartChrome {
  const tokens = agiPalette[mode];
  return {
    grid: tokens.border.strong,
    axis: tokens.text.muted,
    label: tokens.text.secondary,
    surface: tokens.surface.overlay,
    border: tokens.border.strong,
    text: tokens.text.primary,
    hover: tokens.surface.hover,
  };
}

function formatChartValue(value: ChartCellValue | undefined): string {
  if (typeof value === 'number') return value.toLocaleString();
  return value ?? '';
}

function describeSeries(spec: ChartSpec, entry: ChartSeriesSpec): string | null {
  const points = spec.rows
    .map((row) => ({ category: row[spec.xKey], value: row[entry.dataKey] }))
    .filter(
      (point): point is { category: ChartCellValue | undefined; value: number } =>
        typeof point.value === 'number',
    );
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return null;
  const label = entry.name ?? entry.dataKey;
  const at = (point: { category: ChartCellValue | undefined; value: number }) =>
    `${formatChartValue(point.value)} at ${formatChartValue(point.category)}`;
  const lowest = points.reduce((low, point) => (point.value < low.value ? point : low));
  const highest = points.reduce((high, point) => (point.value > high.value ? point : high));
  if (spec.kind === 'pie') {
    const total = points.reduce((sum, point) => sum + point.value, 0);
    return `${label}: total ${formatChartValue(total)}, largest ${at(highest)}, smallest ${at(lowest)}.`;
  }
  return `${label}: starts at ${at(first)}, ends at ${at(last)}, lowest ${at(lowest)}, highest ${at(highest)}.`;
}

export function summarizeChart(spec: ChartSpec, fallbackTitle?: string): string {
  const title = (spec.title ?? fallbackTitle?.trim())?.replace(/[.!?]+$/, '');
  const xAxis = spec.xLabel ?? spec.xKey;
  const pointCount = translateUiPlural('chat', 'counts.chartPoints', spec.rows.length, {
    one: '{{count}} point',
    other: '{{count}} points',
  });
  const plotted =
    spec.kind === 'pie'
      ? `Pie chart of ${pointCount}, one slice per ${xAxis}.`
      : `${spec.kind === 'bar' ? 'Bar' : 'Line'} chart of ${pointCount}, ${xAxis} on the horizontal axis${spec.yLabel ? ` and ${spec.yLabel} on the vertical axis` : ''}.`;
  const truncated =
    spec.totalRows > spec.rows.length
      ? `Showing the first ${spec.rows.length} of ${spec.totalRows} points.`
      : null;
  return [
    title ? `${title}.` : null,
    plotted,
    truncated,
    ...spec.series.map((entry) => describeSeries(spec, entry)),
  ]
    .filter((part): part is string => Boolean(part))
    .join(' ');
}
