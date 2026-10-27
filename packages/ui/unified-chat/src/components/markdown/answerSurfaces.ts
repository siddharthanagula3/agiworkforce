export const ANSWER_SURFACE_LANGUAGES: ReadonlySet<string> = new Set([
  'cards',
  'radio',
  'slider',
  'checks',
  'dropdown',
  'checklist',
  'gallery',
  'details',
  'map',
  'prompt',
  'commands',
  'console',
  'error',
  'status',
  'actions',
  'followups',
  'files',
  'transcript',
  'timeline',
  'modes',
  'citation',
  'tool',
]);

export function isAnswerSurfaceLanguage(language: string): boolean {
  return ANSWER_SURFACE_LANGUAGES.has(language);
}

const LINE_BREAK = /\r?\n/;
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const BADGE_PATTERN = /\[\[([A-Za-z][^\]\n]{0,32})\]\]/g;
const FENCE_MARK = /^(`{3,}|~{3,})/;

export interface TitledBody {
  title: string;
  body: string;
}

export interface RadioOption {
  label: string;
  selected: boolean;
}

export interface RadioSpec {
  prompt: string;
  options: RadioOption[];
}

export interface SliderSpec {
  label: string;
  min: number;
  max: number;
  value: number;
  prefix: string;
}

export interface CheckItem {
  label: string;
  checked: boolean;
}

export interface ChecksSpec {
  title: string;
  items: CheckItem[];
}

export interface DropdownSpec {
  label: string;
  options: string[];
  selected: string;
}

export interface GalleryItem {
  caption: string;
  src: string;
  color: string;
}

export interface DetailsSpec {
  summary: string;
  detail: string;
}

export interface MapStop {
  name: string;
  note: string;
  lat: number | null;
  lon: number | null;
}

export interface StatusRow {
  label: string;
  state: 'passed' | 'failed' | 'pending' | 'untested';
}

export interface ActionItem {
  label: string;
  text: string;
}

export interface FileRow {
  name: string;
  kind: string;
  note: string;
}

export interface TranscriptLine {
  time: string;
  speaker: string;
  text: string;
}

export interface TimelineStep {
  title: string;
  detail: string;
  state: 'complete' | 'progress' | 'todo';
}

export interface CitationSpec {
  title: string;
  source: string;
  href: string;
  summary: string;
}

export interface ChartPoint {
  label: string;
  value: number;
}

export interface ChartSurface {
  title: string;
  xLabel: string;
  yLabel: string;
  points: ChartPoint[];
}

function linesOf(source: string): string[] {
  return source.split(LINE_BREAK);
}

function trimmedLines(source: string): string[] {
  return linesOf(source)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function splitFields(line: string): string[] {
  return line.split('|').map((part) => part.trim());
}

function isFieldLetter(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function fieldKey(line: string): { key: string; value: string } | null {
  const colon = line.indexOf(':');
  if (colon < 1 || colon > 25 || line.includes('|')) return null;
  if (!isFieldLetter(line[0] ?? '')) return null;
  for (let index = 1; index < colon; index += 1) {
    const char = line[index] ?? '';
    if (!isFieldLetter(char) && char !== ' ') return null;
  }
  return { key: line.slice(0, colon).toLowerCase(), value: line.slice(colon + 1).trim() };
}

function fieldMap(source: string): { fields: Map<string, string>; rest: string[] } {
  const fields = new Map<string, string>();
  const rest: string[] = [];
  for (const line of linesOf(source)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const field = fieldKey(trimmed);
    if (field) fields.set(field.key, field.value);
    else rest.push(trimmed);
  }
  return { fields, rest };
}

function skipSpaces(line: string, index: number): number {
  let cursor = index;
  while (cursor < line.length && (line[cursor] === ' ' || line[cursor] === '\t')) cursor += 1;
  return cursor;
}

function isClock(value: string): boolean {
  const colon = value.indexOf(':');
  if (colon < 1 || colon > 2 || value.length !== colon + 3) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (index === colon) continue;
    const code = value.charCodeAt(index);
    if (code < 48 || code > 57) return false;
  }
  return true;
}

function labelledValue(line: string, label: string): string | null {
  if (line.length <= label.length + 1 || line[label.length] !== ':') return null;
  if (line.slice(0, label.length).toLowerCase() !== label) return null;
  return line.slice(label.length + 1).trim();
}

function checkItems(lines: readonly string[]): CheckItem[] {
  return lines.flatMap((line) => {
    let index = 0;
    if (line[0] === '-' || line[0] === '*') index = skipSpaces(line, 1);
    if (line[index] !== '[') return [];
    const mark = line[index + 1];
    if ((mark !== ' ' && mark !== 'x' && mark !== 'X') || line[index + 2] !== ']') return [];
    const labelStart = skipSpaces(line, index + 3);
    if (labelStart === index + 3) return [];
    const label = line.slice(labelStart).trim();
    if (!label) return [];
    return [{ label, checked: mark.toLowerCase() === 'x' }];
  });
}

function numberedOrPlain(lines: readonly string[]): string[] {
  return lines
    .map((line) =>
      line
        .replace(/^\d+[.)]\s+/, '')
        .replace(/^[-*]\s+/, '')
        .trim(),
    )
    .filter(Boolean);
}

export function parseCards(source: string): TitledBody[] {
  return trimmedLines(source).flatMap((line) => {
    const [title, body] = splitFields(line);
    if (!title || !body) return [];
    return [{ title, body }];
  });
}

function afterBullet(line: string): string | null {
  if (line[0] !== '-' && line[0] !== '*') return null;
  const rest = skipSpaces(line, 1);
  if (rest === 1) return null;
  const label = line.slice(rest);
  return label.length > 0 ? label : null;
}

function radioOption(line: string): { label: string; selected: boolean } | null {
  if (line[0] === '*') {
    const label = afterBullet(line);
    if (label) return { label, selected: true };
  }
  const body = afterBullet(line);
  if (!body) return null;
  if (body[0] === '*') {
    const label = afterBullet(body);
    if (label) return { label, selected: true };
  }
  return { label: body, selected: false };
}

export function parseRadio(source: string): RadioSpec | null {
  const { fields, rest } = fieldMap(source);
  const options = rest.flatMap((line) => {
    const option = radioOption(line);
    if (!option) return [];
    return [option];
  });
  if (options.length < 2) return null;
  if (!options.some((option) => option.selected)) options[0] = { ...options[0]!, selected: true };
  return { prompt: fields.get('prompt') ?? fields.get('label') ?? '', options };
}

export function parseSlider(source: string): SliderSpec | null {
  const { fields } = fieldMap(source);
  const min = Number(fields.get('min') ?? '0');
  const max = Number(fields.get('max') ?? '');
  const value = Number(fields.get('value') ?? fields.get('min') ?? '');
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value) || max <= min) {
    return null;
  }
  return {
    label: fields.get('label') ?? 'Value',
    min,
    max,
    value: Math.min(max, Math.max(min, value)),
    prefix: fields.get('prefix') ?? '',
  };
}

export function parseChecks(source: string): ChecksSpec | null {
  const { fields, rest } = fieldMap(source);
  const items = checkItems(rest);
  if (items.length === 0) return null;
  return { title: fields.get('title') ?? 'Your configuration', items };
}

export function parseDropdown(source: string): DropdownSpec | null {
  const { fields, rest } = fieldMap(source);
  const options = numberedOrPlain(rest);
  if (options.length < 2) return null;
  const selected = fields.get('selected') ?? options[0]!;
  return {
    label: fields.get('label') ?? 'Selection',
    options,
    selected: options.includes(selected) ? selected : options[0]!,
  };
}

export function parseChecklist(source: string): ChecksSpec | null {
  const { fields, rest } = fieldMap(source);
  const items = checkItems(rest.length > 0 ? rest : trimmedLines(source));
  if (items.length === 0) return null;
  return { title: fields.get('title') ?? 'Checklist', items };
}

export function parseGallery(source: string): GalleryItem[] {
  const items: GalleryItem[] = [];
  for (const line of trimmedLines(source)) {
    const image = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line);
    if (image) {
      items.push({ caption: image[1]!.trim() || 'Image', src: image[2]!.trim(), color: '' });
      continue;
    }
    const [caption, second] = splitFields(line);
    if (!caption || !second) continue;
    if (HEX_COLOR.test(second)) items.push({ caption, src: '', color: second });
    else items.push({ caption, src: second, color: '' });
  }
  return items;
}

export function parseDetails(source: string): DetailsSpec | null {
  const lines = linesOf(source);
  const summary = lines.find((line) => line.trim())?.trim() ?? '';
  if (!summary) return null;
  const start = lines.findIndex((line) => line.trim() === summary);
  const detail = lines
    .slice(start + 1)
    .join('\n')
    .trim();
  return detail ? { summary, detail } : null;
}

function readCoordinate(value: string): { lat: number; lon: number } | null {
  const match = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(value.trim());
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function parseMap(source: string): MapStop[] {
  return trimmedLines(source).flatMap((line): MapStop[] => {
    const parts = splitFields(line);
    const name = parts[0] ?? '';
    if (!name) return [];
    const coordinate = parts[1] ? readCoordinate(parts[1]) : null;
    if (coordinate) {
      return [
        {
          name,
          note: parts.slice(2).join(' | '),
          lat: coordinate.lat,
          lon: coordinate.lon,
        },
      ];
    }
    return [{ name, note: parts.slice(1).join(' | '), lat: null, lon: null }];
  });
}

export function parsePrompt(source: string): string {
  return source.trim();
}

export function parseStatus(source: string): StatusRow[] {
  return trimmedLines(source).flatMap((line) => {
    const [label, raw] = splitFields(line);
    if (!label || !raw) return [];
    const token = raw.toLowerCase();
    const state: StatusRow['state'] =
      token === 'passed' || token === 'pass' || token === 'completed' || token === 'complete'
        ? 'passed'
        : token === 'failed' || token === 'fail'
          ? 'failed'
          : token === 'pending' || token === 'in progress'
            ? 'pending'
            : 'untested';
    return [{ label, state }];
  });
}

export function parseActions(source: string): ActionItem[] {
  return trimmedLines(source).flatMap((line) => {
    const [label, text] = splitFields(line);
    if (!label || !text) return [];
    return [{ label, text }];
  });
}

export function parseFollowups(source: string): string[] {
  return numberedOrPlain(trimmedLines(source));
}

export function parseFiles(source: string): FileRow[] {
  return trimmedLines(source).flatMap((line) => {
    const [name, kind, note] = splitFields(line);
    if (!name || !kind) return [];
    return [{ name, kind, note: note ?? '' }];
  });
}

export function parseTranscript(source: string): TranscriptLine[] {
  return trimmedLines(source).flatMap((line) => {
    const parts = splitFields(line);
    const time = parts[0] ?? '';
    const speaker = parts[1] ?? '';
    const text = parts.slice(2).join(' | ');
    if (!isClock(time) || !speaker || !text) return [];
    return [{ time, speaker, text }];
  });
}

export function parseTimeline(source: string): TimelineStep[] {
  return trimmedLines(source).flatMap((line) => {
    const parts = splitFields(line);
    const title = (parts[0] ?? '').replace(/^\d+[.)]\s+/, '').trim();
    const detail = parts[1] ?? '';
    const raw = (parts[2] ?? parts[1] ?? '').toLowerCase();
    if (!title) return [];
    const state: TimelineStep['state'] =
      raw === 'complete' || raw === 'completed'
        ? 'complete'
        : raw === 'in progress' || raw === 'progress'
          ? 'progress'
          : 'todo';
    const stepDetail = parts.length >= 3 ? detail : '';
    return [{ title, detail: stepDetail, state }];
  });
}

export function parseModes(source: string): TitledBody[] {
  return parseCards(source);
}

export const TOOL_STATES = ['requested', 'running', 'completed', 'failed', 'cancelled'] as const;

export type ToolState = (typeof TOOL_STATES)[number];

export interface ToolSpec {
  name: string;
  state: ToolState;
  output: string;
}

const TOOL_STATE_SET: ReadonlySet<string> = new Set(TOOL_STATES);

export function toolStateLabel(state: ToolState): string {
  switch (state) {
    case 'requested':
      return 'Requested';
    case 'running':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
  }
}

export function parseTool(source: string): ToolSpec | null {
  const lines = source.split(LINE_BREAK);
  let name = '';
  let state = '';
  let index = 0;
  for (; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? '').trim();
    if (!trimmed) {
      index += 1;
      break;
    }
    const named = labelledValue(trimmed, 'name');
    const stated = labelledValue(trimmed, 'state');
    if (named !== null) {
      name = named;
      continue;
    }
    if (stated !== null) {
      state = stated.toLowerCase();
      continue;
    }
    break;
  }
  if (!name || !TOOL_STATE_SET.has(state)) return null;
  return {
    name,
    state: state as ToolState,
    output: lines.slice(index).join('\n').trim(),
  };
}

export function statusStateLabel(state: StatusRow['state']): string {
  switch (state) {
    case 'passed':
      return 'Passed';
    case 'failed':
      return 'Failed';
    case 'pending':
      return 'Pending';
    case 'untested':
      return 'Not tested';
  }
}

export function checklistProgress(items: readonly CheckItem[]): string {
  const done = items.filter((item) => item.checked).length;
  return `${done} of ${items.length}`;
}

export function parseCitation(source: string): CitationSpec | null {
  const { fields } = fieldMap(source);
  const title = fields.get('title') ?? '';
  const href = fields.get('url') ?? fields.get('href') ?? '';
  if (!title || !href) return null;
  return {
    title,
    source: fields.get('source') ?? '',
    href,
    summary: fields.get('summary') ?? '',
  };
}

export function parseChartSurface(source: string): ChartSurface | null {
  const trimmed = source.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const record = Array.isArray(parsed) ? { data: parsed } : parsed;
      if (!record || typeof record !== 'object') return null;
      const data =
        (record as { data?: unknown; rows?: unknown }).data ?? (record as { rows?: unknown }).rows;
      if (!Array.isArray(data)) return null;
      const points = data.flatMap((row) => {
        if (!row || typeof row !== 'object') return [];
        const entry = row as Record<string, unknown>;
        const label = String(entry['name'] ?? entry['label'] ?? entry['month'] ?? '');
        const value = Number(entry['value'] ?? entry['requests'] ?? entry['y']);
        if (!label || !Number.isFinite(value)) return [];
        return [{ label, value }];
      });
      if (points.length === 0) return null;
      const titled = record as { title?: unknown; x?: unknown; y?: unknown };
      return {
        title: typeof titled.title === 'string' ? titled.title : '',
        xLabel: typeof titled.x === 'string' ? titled.x : 'Label',
        yLabel: typeof titled.y === 'string' ? titled.y : 'Value',
        points,
      };
    } catch {
      return null;
    }
  }
  const { fields, rest } = fieldMap(source);
  const points = rest.flatMap((line) => {
    const [label, raw] = splitFields(line);
    const value = Number(raw);
    if (!label || !Number.isFinite(value)) return [];
    return [{ label, value }];
  });
  if (points.length === 0) return null;
  return {
    title: fields.get('title') ?? '',
    xLabel: fields.get('x') ?? 'Label',
    yLabel: fields.get('y') ?? 'Value',
    points,
  };
}

export function chartAxisMax(points: readonly ChartPoint[]): number {
  const peak = points.reduce((max, point) => Math.max(max, point.value), 0);
  if (peak <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  const normalized = peak / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function answerSurfacePlainText(language: string, source: string): string {
  if (language === 'chart') {
    const chart = parseChartSurface(source);
    if (!chart) return source.trim();
    const rows = chart.points.map((point) => `${point.label}\t${point.value}`).join('\n');
    return [chart.title, `${chart.xLabel}\t${chart.yLabel}`, rows].filter(Boolean).join('\n');
  }
  return source.trim();
}

export function liftAnswerBadges(markdown: string): string {
  const lines = markdown.split('\n');
  let fence: string | null = null;
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (fence) {
        if (
          trimmed.startsWith(fence) &&
          trimmed.length >= 3 &&
          [...trimmed].every((char) => char === fence)
        ) {
          fence = null;
        }
        return line;
      }
      const opening = FENCE_MARK.exec(trimmed);
      if (
        (opening && trimmed.slice(opening[1]!.length).trim() !== '') ||
        (opening && trimmed === opening[1])
      ) {
        fence = opening![1]![0]!;
        return line;
      }
      return line.replace(BADGE_PATTERN, '<span class="answer-badge">$1</span>');
    })
    .join('\n');
}
