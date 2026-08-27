import { agiPalette, type AgiThemeMode } from '@agiworkforce/design-tokens';

export const CHART_KINDS = ['bar', 'line', 'pie'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

export const CHART_ROW_CAP = 500;
export const CHART_SERIES_CAP = 12;

const DEFAULT_X_KEY = 'name';

const KIND_KEYS = ['type', 'chartType', 'chart_type', 'kind'] as const;
const X_KEYS = ['xKey', 'x_key', 'nameKey', 'name_key', 'labelKey', 'categoryKey'] as const;
const AXIS_CONTAINER_KEYS = { x: ['xAxis', 'x_axis'], y: ['yAxis', 'y_axis'] } as const;
const SERIES_CONTAINER_KEYS = ['series', 'bars', 'lines', 'slices', 'datasets'] as const;
const SERIES_KEY_KEYS = ['dataKey', 'data_key', 'key', 'field'] as const;
const SERIES_LABEL_KEYS = ['name', 'label', 'title'] as const;
const SERIES_COLOR_KEYS = ['color', 'fill', 'stroke'] as const;
const ROWS_KEYS = ['data', 'rows', 'values', 'points'] as const;
const LEGEND_KEYS = ['showLegend', 'show_legend', 'legend'] as const;

const HEX_SHORTHAND_LENGTH = 3;
const HEX_CHANNEL_OFFSETS = [0, 2, 4] as const;
const HEX_CHANNEL_WIDTH = 2;
const HEX_RADIX = 16;
const CHANNEL_MAX = 255;
const SERIES_SHADE_RATIO = 0.45;

/** Model-authored colours land in an SVG presentation attribute, so only plain
 *  colour syntax is accepted — never `url(...)` references or CSS functions. */
const SAFE_COLOR_RE = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\(\s*[\d\s.,%/-]+\s*\)|[a-z]{3,20})$/i;
const HEX_RE = /^[0-9a-f]{6}$/i;

export type ChartCellValue = string | number;
export type ChartRow = Record<string, ChartCellValue>;

export interface ChartSeriesSpec {
  dataKey: string;
  name?: string;
  color?: string;
}

export interface ChartSpec {
  kind: ChartKind;
  rows: ChartRow[];
  xKey: string;
  series: ChartSeriesSpec[];
  showLegend: boolean;
  totalRows: number;
}

export interface ChartChrome {
  grid: string;
  axis: string;
  label: string;
  surface: string;
  border: string;
  text: string;
  hover: string;
}

export type ChartParseResult = { ok: true; spec: ChartSpec } | { ok: false; reason: string };

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function readBoolean(
  source: Record<string, unknown>,
  keys: readonly string[],
): boolean | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

function readArray(
  source: Record<string, unknown>,
  keys: readonly string[],
): unknown[] | undefined {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }
  return undefined;
}

function readAxis(
  spec: Record<string, unknown>,
  containers: readonly string[],
): Record<string, unknown> | undefined {
  for (const key of containers) {
    const value = spec[key];
    if (isRecord(value)) return value;
  }
  return undefined;
}

function readAxisKey(
  spec: Record<string, unknown>,
  containers: readonly string[],
): string | undefined {
  const axis = readAxis(spec, containers);
  return axis ? readString(axis, SERIES_KEY_KEYS) : undefined;
}

export function toChartNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeRow(raw: unknown): ChartRow | null {
  if (!isRecord(raw)) return null;
  const row: ChartRow = Object.create(null) as ChartRow;
  for (const [key, value] of Object.entries(raw)) {
    const asNumber = toChartNumber(value);
    if (asNumber !== null) {
      row[key] = asNumber;
      continue;
    }
    if (typeof value === 'string') row[key] = value;
    else if (typeof value === 'boolean') row[key] = String(value);
  }
  return Object.keys(row).length > 0 ? { ...row } : null;
}

function safeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return SAFE_COLOR_RE.test(trimmed) ? trimmed : undefined;
}

function pickXKey(rows: ChartRow[], requested: string | undefined): string {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  if (requested && keys.includes(requested)) return requested;
  const categorical = keys.find((key) => rows.every((row) => typeof row[key] !== 'number'));
  return categorical ?? keys[0] ?? DEFAULT_X_KEY;
}

function declaredSeries(spec: Record<string, unknown>): ChartSeriesSpec[] {
  const entries = readArray(spec, SERIES_CONTAINER_KEYS);
  if (!entries) {
    const yKey = readAxisKey(spec, AXIS_CONTAINER_KEYS.y);
    return yKey ? [{ dataKey: yKey }] : [];
  }
  const series: ChartSeriesSpec[] = [];
  for (const entry of entries) {
    if (typeof entry === 'string' && entry.trim()) {
      series.push({ dataKey: entry.trim() });
      continue;
    }
    if (!isRecord(entry)) continue;
    const dataKey = readString(entry, SERIES_KEY_KEYS) ?? readString(entry, SERIES_LABEL_KEYS);
    if (!dataKey) continue;
    series.push({
      dataKey,
      name: readString(entry, SERIES_LABEL_KEYS),
      color: safeColor(
        SERIES_COLOR_KEYS.map((key) => entry[key]).find((value) => typeof value === 'string'),
      ),
    });
  }
  return series;
}

function inferSeries(rows: ChartRow[], xKey: string): ChartSeriesSpec[] {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return keys
    .filter((key) => key !== xKey && rows.some((row) => typeof row[key] === 'number'))
    .map((dataKey) => ({ dataKey }));
}

export function parseChartArtifact(content: string): ChartParseResult {
  const source = (content ?? '').trim();
  if (!source) return { ok: false, reason: 'This chart artifact has no content yet.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { ok: false, reason: 'This chart is not valid JSON, so it cannot be plotted.' };
  }

  if (!Array.isArray(parsed) && !isRecord(parsed)) {
    return { ok: false, reason: 'This chart is not a chart definition object.' };
  }
  const spec: Record<string, unknown> = Array.isArray(parsed) ? { data: parsed } : parsed;

  const requestedKind = readString(spec, KIND_KEYS)?.toLowerCase();
  if (requestedKind && !(CHART_KINDS as readonly string[]).includes(requestedKind)) {
    return {
      ok: false,
      reason: `Unsupported chart type "${requestedKind}". Supported types: ${CHART_KINDS.join(', ')}.`,
    };
  }
  const kind = (requestedKind ?? CHART_KINDS[0]) as ChartKind;

  const rawRows = readArray(spec, ROWS_KEYS);
  if (!rawRows) return { ok: false, reason: 'This chart has no data array to plot.' };

  const allRows = rawRows.map(normalizeRow).filter((row): row is ChartRow => row !== null);
  if (allRows.length === 0) return { ok: false, reason: 'This chart has no usable data rows.' };

  const rows = allRows.slice(0, CHART_ROW_CAP);
  const requestedXKey =
    readString(spec, X_KEYS) ?? readAxisKey(spec, AXIS_CONTAINER_KEYS.x) ?? undefined;
  const xKey = pickXKey(rows, requestedXKey);

  const declared = declaredSeries(spec).filter(
    (entry) => entry.dataKey !== xKey && rows.some((row) => typeof row[entry.dataKey] === 'number'),
  );
  const series = (declared.length > 0 ? declared : inferSeries(rows, xKey)).slice(
    0,
    CHART_SERIES_CAP,
  );
  if (series.length === 0) {
    return { ok: false, reason: 'This chart has no numeric series to plot.' };
  }

  return {
    ok: true,
    spec: {
      kind,
      rows,
      xKey,
      series,
      showLegend: readBoolean(spec, LEGEND_KEYS) ?? (series.length > 1 || kind === 'pie'),
      totalRows: allRows.length,
    },
  };
}
