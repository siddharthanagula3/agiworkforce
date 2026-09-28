export interface ChartSeries {
  type: 'bar' | 'line';
  name?: string;
  values: number[];
}

export interface XyChart {
  kind: 'xy';
  title?: string;
  categories: string[];
  yLabel?: string;
  yRange?: { min: number; max: number };
  series: ChartSeries[];
}

export interface PieChart {
  kind: 'pie';
  title?: string;
  slices: Array<{ label: string; value: number }>;
}

export type MermaidChart = XyChart | PieChart;

const MAX_CHART_CATEGORIES = 40;
const MAX_CHART_SERIES = 6;
const MAX_PIE_SLICES = 12;
const NUMBER = /^-?\d+(?:\.\d+)?$/;
const RANGE = /^(-?\d+(?:\.\d+)?)\s*-->\s*(-?\d+(?:\.\d+)?)$/;
const PIE_HEADER = /^pie(?:\s+showData)?(?:\s+title\s+(.+))?$/i;
const PIE_SLICE = /^"([^"]+)"\s*:\s*(\d+(?:\.\d+)?)$/;
const IGNORED_STATEMENT = /^(?:accTitle|accDescr)\b/;

function unquote(value: string): string {
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed;
}

function splitList(body: string): string[] {
  const items: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of body) {
    if (char === '"') quoted = !quoted;
    if (char === ',' && !quoted) {
      items.push(unquote(current));
      current = '';
      continue;
    }
    current += char;
  }
  items.push(unquote(current));
  return items;
}

function readBracketList(text: string): string[] | null {
  const match = /^\[(.*)\]$/.exec(text.trim());
  return match ? splitList(match[1] ?? '') : null;
}

function readLeadingTitle(text: string): { title?: string; rest: string } {
  const trimmed = text.trim();
  const quoted = /^"([^"]*)"\s*(.*)$/.exec(trimmed);
  if (quoted) return { title: quoted[1], rest: quoted[2] ?? '' };
  if (trimmed === '' || trimmed.startsWith('[') || /^-?\d/.test(trimmed)) return { rest: trimmed };
  const word = /^(\S+)\s*(.*)$/.exec(trimmed);
  return word ? { title: word[1], rest: word[2] ?? '' } : { rest: trimmed };
}

function parseXyChart(lines: readonly string[]): XyChart | null {
  const chart: XyChart = { kind: 'xy', categories: [], series: [] };
  for (const line of lines) {
    const keyword = line.split(/\s+/)[0] ?? '';
    const rest = line.slice(keyword.length).trim();
    switch (keyword.toLowerCase()) {
      case 'title':
        chart.title = unquote(rest);
        break;
      case 'x-axis': {
        const categories = readBracketList(readLeadingTitle(rest).rest);
        if (!categories || categories.length === 0) return null;
        chart.categories = categories;
        break;
      }
      case 'y-axis': {
        const { title, rest: axis } = readLeadingTitle(rest);
        if (title) chart.yLabel = title;
        const range = RANGE.exec(axis.trim());
        if (range) chart.yRange = { min: Number(range[1]), max: Number(range[2]) };
        else if (axis.trim()) return null;
        break;
      }
      case 'bar':
      case 'line': {
        const { title, rest: data } = readLeadingTitle(rest);
        const raw = readBracketList(data);
        if (!raw || raw.some((value) => !NUMBER.test(value))) return null;
        chart.series.push({
          type: keyword.toLowerCase() === 'bar' ? 'bar' : 'line',
          ...(title ? { name: title } : {}),
          values: raw.map(Number),
        });
        break;
      }
      default:
        if (!IGNORED_STATEMENT.test(line)) return null;
    }
  }
  const count = chart.categories.length;
  if (count === 0 || count > MAX_CHART_CATEGORIES) return null;
  if (chart.series.length === 0 || chart.series.length > MAX_CHART_SERIES) return null;
  if (chart.series.some((series) => series.values.length !== count)) return null;
  if (chart.yRange && !(chart.yRange.max > chart.yRange.min)) return null;
  return chart;
}

function parsePieChart(headerTitle: string | undefined, lines: readonly string[]): PieChart | null {
  const chart: PieChart = { kind: 'pie', slices: [] };
  if (headerTitle) chart.title = unquote(headerTitle);
  for (const line of lines) {
    if (/^title\b/i.test(line)) {
      chart.title = unquote(line.slice('title'.length));
      continue;
    }
    const slice = PIE_SLICE.exec(line);
    if (slice) {
      chart.slices.push({ label: slice[1] ?? '', value: Number(slice[2]) });
      continue;
    }
    if (!IGNORED_STATEMENT.test(line)) return null;
  }
  if (chart.slices.length === 0 || chart.slices.length > MAX_PIE_SLICES) return null;
  if (chart.slices.reduce((total, slice) => total + slice.value, 0) <= 0) return null;
  return chart;
}

export function parseMermaidChart(source: string): MermaidChart | null {
  const lines = source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('%%'));
  const header = lines[0];
  if (!header) return null;
  if (/^xychart(?:-beta)?$/i.test(header)) return parseXyChart(lines.slice(1));
  const pie = PIE_HEADER.exec(header);
  if (pie) return parsePieChart(pie[1], lines.slice(1));
  return null;
}

export function formatChartValue(value: number): string {
  return Number(value.toPrecision(4)).toLocaleString();
}

export function describeChart(chart: MermaidChart): string {
  if (chart.kind === 'pie') {
    const total = chart.slices.reduce((sum, slice) => sum + slice.value, 0);
    const parts = chart.slices.map(
      (slice) => `${slice.label} ${formatChartValue((slice.value / total) * 100)} percent`,
    );
    return `Pie chart${chart.title ? `, ${chart.title}` : ''}: ${parts.join(', ')}`;
  }
  const parts = chart.series.map((series, index) => {
    const points = chart.categories.map(
      (category, pointIndex) => `${category} ${formatChartValue(series.values[pointIndex] ?? 0)}`,
    );
    return `${series.name ?? `${series.type === 'bar' ? 'Bars' : 'Line'} ${index + 1}`}: ${points.join(', ')}`;
  });
  return `Chart${chart.title ? `, ${chart.title}` : ''}${chart.yLabel ? ` in ${chart.yLabel}` : ''}. ${parts.join('. ')}`;
}
