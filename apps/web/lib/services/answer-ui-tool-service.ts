import 'server-only';

import {
  AnswerUiCardBodySchema,
  containsAnswerUiHtml,
  isAnswerUiHttpsUrl,
  parseInteractiveCardDelta,
} from '@agiworkforce/cloud-contracts';
import {
  ANSWER_UI_CARD_KIND,
  ANSWER_UI_COLUMNS_MAX,
  ANSWER_UI_COLUMNS_MIN,
  ANSWER_UI_LIMITS,
  ANSWER_UI_TOOL_NAME,
  INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH,
  INTERACTIVE_CARD_SCHEMA_VERSION,
  answerUiControls,
  answerUiInitialValues,
  isAnswerUiContainer,
  parseAnswerUiExpression,
  renderAnswerUiTemplate,
  resolveAnswerUiNumber,
  walkAnswerUiBlocks,
  type AnswerUiActionButton,
  type AnswerUiBlock,
  type AnswerUiCardBody,
  type AnswerUiChartPoint,
  type AnswerUiChartSeries,
  type AnswerUiChartType,
  type AnswerUiChoiceStyle,
  type AnswerUiControlBlock,
  type AnswerUiInputType,
  type AnswerUiStatusTone,
  type AnswerUiValues,
  type InteractiveCard,
} from '@agiworkforce/types';

export { ANSWER_UI_CARD_KIND, ANSWER_UI_TOOL_NAME };

export function isAnswerUiTool(name: string): boolean {
  return name === ANSWER_UI_TOOL_NAME;
}

const TOOL_DESCRIPTION = [
  'Show part of your answer as interactive UI inside the chat, built from blocks: cards, columns, tables, charts, checklists, choices, sliders, inputs, live readouts, expandable sections, image galleries, maps, callouts, buttons, status lists, numbered steps, key-value panels, copy-ready text, follow-up suggestions, file items and transcripts.',
  'Use it only when the answer is easier to use than to read: options compared side by side (columns of cards, or a table), numbers the user will want to explore (sliders with a readout or chart), steps to tick off (checklist), places (map), or when the user asks to see UI, a dashboard, a calculator or a tool.',
  'Do not use it for short factual answers, definitions, explanations, advice, code, or writing; plain text is better there and most answers need no UI.',
  'Call it once per reply with everything in one call. Write at most one short sentence before it. It renders below your text, so do not repeat what it shows.',
  'Every control needs a short id (letters, digits, underscores). Readouts, button messages and copy text are templates: {id} inserts that control\'s current value, and {= expression} computes with + - * / ( ) over slider and number ids, such as "Left each month: ${= income - rent - food}". A chart value may be a formula string such as "=rent" so the chart follows a slider.',
  "A send button posts its message template, with the current values, as the user's next message, so word it as the user would; a suggestions block sends the chosen item the same way.",
  'A text block is chat markdown: fenced code (bash, diff, json, sql and others), math, and ```email or ```writing drafts render as their own components inside it. A card with text and buttons is an action panel. Files are illustrative unless given an https url.',
].join(' ');

const CHILD_BLOCKS_DESCRIPTION =
  'Child blocks, each with the same fields as a top-level block. card and disclosure hold content; columns places each child side by side (2 to 4, usually cards).';

const BLOCK_PROPERTIES = {
  type: {
    type: 'string',
    enum: [
      'heading',
      'text',
      'callout',
      'card',
      'columns',
      'table',
      'chart',
      'checklist',
      'choice',
      'slider',
      'input',
      'readout',
      'disclosure',
      'gallery',
      'map',
      'actions',
      'status',
      'steps',
      'keyvalue',
      'copy',
      'suggestions',
      'files',
      'transcript',
    ],
  },
  id: { type: 'string', description: 'Short unique id; required on controls.' },
  text: {
    type: 'string',
    description:
      'heading text; markdown for text, callout and card blocks; the copy-ready text of a copy block.',
  },
  title: {
    type: 'string',
    description: 'Title of a card, chart, list, map, copy or callout block.',
  },
  subtitle: { type: 'string', description: 'card subtitle, such as a price.' },
  badge: { type: 'string', description: 'card or copy badge, such as Popular.' },
  tone: { type: 'string', enum: ['info', 'success', 'warning', 'danger'] },
  blocks: { type: 'array', items: { type: 'object' }, description: CHILD_BLOCKS_DESCRIPTION },
  columns: {
    type: 'array',
    items: { type: 'string' },
    description: 'table column headers.',
  },
  rows: {
    type: 'array',
    items: { type: 'array', items: { type: 'string' } },
    description: 'table rows, one plain-text cell per column.',
  },
  chart: { type: 'string', enum: ['bar', 'line', 'pie', 'scatter'] },
  labels: {
    type: 'array',
    items: { type: 'string' },
    description: 'chart categories (x axis or pie slices).',
  },
  series: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        values: {
          type: 'array',
          items: { type: ['number', 'string'] },
          description: 'One number or "=formula" per label; for scatter use [x, y] pairs.',
        },
      },
    },
  },
  xLabel: { type: 'string' },
  yLabel: { type: 'string' },
  label: { type: 'string', description: 'control label.' },
  items: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        text: { type: 'string' },
        checked: { type: 'boolean' },
        status: { type: 'string', description: 'badge text, such as Passed or In progress.' },
        tone: { type: 'string', enum: ['success', 'danger', 'warning', 'neutral'] },
        value: { type: 'string' },
        name: { type: 'string' },
        fileType: { type: 'string' },
        time: { type: 'string' },
        speaker: { type: 'string' },
      },
    },
    description:
      'Rows of a list block. checklist: label, checked. status: label, status, tone. steps: label, text, status, tone. keyvalue: label, value. suggestions: text. files: name, fileType, text. transcript: time, speaker, text.',
  },
  style: {
    type: 'string',
    enum: ['radio', 'checkbox', 'dropdown'],
    description: 'choice style.',
  },
  options: { type: 'array', items: { type: 'string' }, description: 'choice options.' },
  selected: {
    type: 'array',
    items: { type: 'string' },
    description: 'choice options selected at first.',
  },
  min: { type: 'number' },
  max: { type: 'number' },
  step: { type: 'number' },
  value: {
    type: ['number', 'string'],
    description: 'slider or input starting value, or the template of a readout.',
  },
  unit: { type: 'string', description: 'slider unit, such as $ or %.' },
  inputType: { type: 'string', enum: ['text', 'number', 'date'] },
  placeholder: { type: 'string' },
  readout: {
    type: 'string',
    description: 'Template shown under a control, such as "Selected plan: {plan}".',
  },
  open: { type: 'boolean', description: 'disclosure starts open.' },
  images: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'https image URL from this conversation.' },
        alt: { type: 'string' },
        caption: { type: 'string' },
      },
    },
  },
  pins: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        note: { type: 'string' },
        address: { type: 'string' },
      },
    },
  },
  buttons: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        action: { type: 'string', enum: ['send', 'copy', 'link', 'reset'] },
        message: { type: 'string', description: 'send: message template; copy: text template.' },
        url: { type: 'string', description: 'link: https URL.' },
      },
    },
  },
} as const;

export function answerUiToolDefinition() {
  return {
    type: 'function' as const,
    function: {
      name: ANSWER_UI_TOOL_NAME,
      description: TOOL_DESCRIPTION,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Optional title over the whole UI.' },
          blocks: {
            type: 'array',
            minItems: 1,
            items: { type: 'object', properties: BLOCK_PROPERTIES, required: ['type'] },
          },
        },
        required: ['blocks'],
      },
    },
  };
}

type Raw = Record<string, unknown>;

function isRaw(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withoutControlCharacters(value: string): string {
  let kept = '';
  for (const character of value) {
    const code = character.charCodeAt(0);
    const control = (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
    if (!control) kept += character;
  }
  return kept;
}
const HTML_TAGS = /<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>|<!--[\s\S]*?-->/gi;

const DANGEROUS_ELEMENTS = /<(script|style|iframe|object|embed|template)\b[\s\S]*?<\/\1\s*>/gi;

function stripHtml(value: string): string {
  let current = value.replace(DANGEROUS_ELEMENTS, '');
  for (let pass = 0; pass < 8 && containsAnswerUiHtml(current); pass += 1) {
    current = current.replace(HTML_TAGS, '');
  }
  return containsAnswerUiHtml(current) ? current.replace(/</g, '‹') : current;
}

function text(value: unknown, max: number): string | undefined {
  const raw = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null;
  if (raw === null) return undefined;
  const cleaned = stripHtml(withoutControlCharacters(raw)).trim();
  return cleaned.length > 0 ? cleaned.slice(0, max).trim() : undefined;
}

function firstText(raw: Raw, keys: readonly string[], max: number): string | undefined {
  for (const key of keys) {
    const value = text(raw[key], max);
    if (value) return value;
  }
  return undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[\s,$€£¥₹%]/g, '');
  if (cleaned === '') return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function firstNum(raw: Raw, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = num(raw[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function parsedArray(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim().startsWith('[')) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function list(raw: Raw, keys: readonly string[]): unknown[] | undefined {
  for (const key of keys) {
    const value = parsedArray(raw[key]);
    if (value) return value;
  }
  return undefined;
}

function bool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1) return true;
  if (value === 'false' || value === 0) return false;
  return undefined;
}

function slug(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, ANSWER_UI_LIMITS.idLength);
  if (base.length === 0) return '';
  return /^[a-z]/.test(base) ? base : `n_${base}`.slice(0, ANSWER_UI_LIMITS.idLength);
}

const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(\s*((?:[^()\s]|\([^()\s]*\))*)[^)]*\)/g;
const MARKDOWN_LINK = /\[([^\]]+)\]\(\s*((?:[^()\s]|\([^()\s]*\))*)[^)]*\)/g;

function safeMarkdown(value: unknown, max: number): string | undefined {
  const cleaned = text(value, max);
  if (!cleaned) return undefined;
  return cleaned
    .replace(MARKDOWN_IMAGE, (whole, alt: string, url: string) =>
      isAnswerUiHttpsUrl(url) ? whole : alt,
    )
    .replace(MARKDOWN_LINK, (whole, label: string, url: string) =>
      isAnswerUiHttpsUrl(url) ? whole : label,
    );
}

const TYPE_ALIASES: Readonly<Record<string, string>> = {
  paragraph: 'text',
  markdown: 'text',
  prose: 'text',
  title: 'heading',
  header: 'heading',
  alert: 'callout',
  note: 'callout',
  notice: 'callout',
  tip: 'callout',
  warning: 'callout',
  grid: 'columns',
  row: 'columns',
  cards: 'columns',
  radio: 'choice',
  select: 'choice',
  dropdown: 'choice',
  checkbox: 'choice',
  checkboxes: 'choice',
  options: 'choice',
  range: 'slider',
  textfield: 'input',
  text_input: 'input',
  number: 'input',
  date: 'input',
  stat: 'readout',
  metric: 'readout',
  output: 'readout',
  result: 'readout',
  summary: 'readout',
  details: 'disclosure',
  accordion: 'disclosure',
  expandable: 'disclosure',
  collapsible: 'disclosure',
  images: 'gallery',
  image: 'gallery',
  carousel: 'gallery',
  button: 'actions',
  buttons: 'actions',
  action: 'actions',
  todo: 'checklist',
  tasks: 'checklist',
  badges: 'status',
  statuses: 'status',
  status_list: 'status',
  status_labels: 'status',
  timeline: 'steps',
  workflow: 'steps',
  step: 'steps',
  progress: 'steps',
  key_value: 'keyvalue',
  kv: 'keyvalue',
  properties: 'keyvalue',
  facts: 'keyvalue',
  prompt: 'copy',
  copy_block: 'copy',
  snippet: 'copy',
  copyable: 'copy',
  follow_ups: 'suggestions',
  followups: 'suggestions',
  suggestion: 'suggestions',
  chips: 'suggestions',
  file: 'files',
  attachments: 'files',
  attachment: 'files',
  dialogue: 'transcript',
  panel: 'card',
  action_panel: 'card',
  bar: 'chart',
  line: 'chart',
  pie: 'chart',
  scatter: 'chart',
};

interface Builder {
  ids: Set<string>;
  aliases: Map<string, string>;
  nodes: number;
  notes: string[];
}

function claimId(builder: Builder, preferred: unknown, fallbackBase: string): string {
  const base = (typeof preferred === 'string' && slug(preferred)) || slug(fallbackBase) || 'block';
  let id = base;
  for (let counter = 2; builder.ids.has(id); counter += 1) {
    id = `${base.slice(0, ANSWER_UI_LIMITS.idLength - 4)}_${counter}`;
  }
  builder.ids.add(id);
  return id;
}

function alias(builder: Builder, id: string, ...names: Array<string | undefined>): void {
  for (const name of names) {
    if (!name) continue;
    const key = slug(name);
    if (key && !builder.aliases.has(key)) builder.aliases.set(key, id);
  }
}

function uniqueItemIds<T>(entries: T[], base: (entry: T, index: number) => string): string[] {
  const used = new Set<string>();
  return entries.map((entry, index) => {
    const preferred = slug(base(entry, index)) || `item_${index + 1}`;
    let id = preferred;
    for (let counter = 2; used.has(id); counter += 1) id = `${preferred.slice(0, 34)}_${counter}`;
    used.add(id);
    return id;
  });
}

function childList(raw: Raw, keys: readonly string[]): unknown[] {
  const children = list(raw, keys);
  if (children) return children;
  const body = safeMarkdown(
    raw['text'] ?? raw['markdown'] ?? raw['body'] ?? raw['content'],
    ANSWER_UI_LIMITS.textLength,
  );
  return body ? [{ type: 'text', text: body }] : [];
}

function headingBlock(raw: Raw, builder: Builder): AnswerUiBlock | null {
  const value = firstText(raw, ['text', 'title', 'content', 'label'], ANSWER_UI_LIMITS.titleLength);
  if (!value) return null;
  const level = num(raw['level']);
  return {
    type: 'heading',
    id: claimId(builder, raw['id'], 'heading'),
    text: value,
    level: level !== undefined && level >= 3 ? 3 : 2,
  };
}

function textBlock(raw: Raw, builder: Builder): AnswerUiBlock | null {
  const markdown = safeMarkdown(
    raw['text'] ?? raw['markdown'] ?? raw['content'] ?? raw['body'] ?? raw['value'],
    ANSWER_UI_LIMITS.textLength,
  );
  return markdown ? { type: 'text', id: claimId(builder, raw['id'], 'text'), markdown } : null;
}

const TONES: Readonly<Record<string, 'info' | 'success' | 'warning' | 'danger'>> = {
  info: 'info',
  note: 'info',
  tip: 'info',
  success: 'success',
  ok: 'success',
  warning: 'warning',
  warn: 'warning',
  caution: 'warning',
  danger: 'danger',
  error: 'danger',
};

function calloutBlock(raw: Raw, builder: Builder, typeHint: string): AnswerUiBlock | null {
  const markdown = safeMarkdown(
    raw['text'] ?? raw['markdown'] ?? raw['content'] ?? raw['body'],
    ANSWER_UI_LIMITS.textLength,
  );
  const title = firstText(raw, ['title'], ANSWER_UI_LIMITS.titleLength);
  if (!markdown && !title) return null;
  const toneKey = String(
    raw['tone'] ?? raw['variant'] ?? raw['severity'] ?? typeHint,
  ).toLowerCase();
  return {
    type: 'callout',
    id: claimId(builder, raw['id'], 'callout'),
    tone: TONES[toneKey] ?? 'info',
    ...(title && markdown ? { title } : {}),
    markdown: markdown ?? title!,
  };
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return text(value, ANSWER_UI_LIMITS.cellLength) ?? '';
}

function tableBlock(raw: Raw, builder: Builder): AnswerUiBlock | null {
  const rawRows = list(raw, ['rows', 'data', 'body']) ?? [];
  let columns = (list(raw, ['columns', 'headers', 'header']) ?? [])
    .map((column) =>
      isRaw(column)
        ? firstText(column, ['label', 'title', 'name', 'key'], ANSWER_UI_LIMITS.labelLength)
        : text(column, ANSWER_UI_LIMITS.labelLength),
    )
    .filter((column): column is string => Boolean(column));
  const firstObject = rawRows.find(isRaw);
  if (columns.length === 0 && firstObject) {
    columns = Object.keys(firstObject)
      .map((key) => text(key, ANSWER_UI_LIMITS.labelLength))
      .filter((key): key is string => Boolean(key));
  }
  columns = columns.slice(0, ANSWER_UI_LIMITS.tableColumns);
  if (columns.length === 0) return null;
  const rows = rawRows
    .map((row) => {
      if (Array.isArray(row)) return columns.map((_, index) => cellText(row[index]));
      if (isRaw(row)) {
        const entries = Object.entries(row);
        return columns.map((column, index) => {
          const match = entries.find(([key]) => key.toLowerCase() === column.toLowerCase());
          return cellText(match ? match[1] : entries[index]?.[1]);
        });
      }
      return null;
    })
    .filter((row): row is string[] => row !== null && row.some((cell) => cell.length > 0))
    .slice(0, ANSWER_UI_LIMITS.tableRows);
  if (rows.length === 0) return null;
  const caption = firstText(raw, ['caption', 'title'], ANSWER_UI_LIMITS.titleLength);
  return {
    type: 'table',
    id: claimId(builder, raw['id'], 'table'),
    ...(caption ? { caption } : {}),
    columns,
    rows,
  };
}

const CHART_TYPE_ALIASES: Readonly<Record<string, AnswerUiChartType>> = {
  bar: 'bar',
  column: 'bar',
  histogram: 'bar',
  line: 'line',
  area: 'line',
  pie: 'pie',
  donut: 'pie',
  doughnut: 'pie',
  scatter: 'scatter',
};

function chartValue(value: unknown): number | string | undefined {
  const numeric = num(value);
  if (numeric !== undefined) return numeric;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.startsWith('=')) {
    const formula = trimmed.slice(1).trim();
    return formula.length > 0 && formula.length <= ANSWER_UI_LIMITS.expressionLength
      ? `=${formula}`
      : undefined;
  }
  return parseAnswerUiExpression(trimmed) ? `=${trimmed}` : undefined;
}

function seriesPoints(rawSeries: Raw, labels: string[], scatter: boolean): AnswerUiChartPoint[] {
  const entries = list(rawSeries, ['points', 'values', 'data']) ?? [];
  const points: AnswerUiChartPoint[] = [];
  entries.forEach((entry, index) => {
    if (Array.isArray(entry) && entry.length >= 2) {
      const x = num(entry[0]) ?? text(entry[0], ANSWER_UI_LIMITS.labelLength);
      const y = chartValue(entry[1]);
      if (x !== undefined && y !== undefined) points.push({ x, y });
      return;
    }
    if (isRaw(entry)) {
      const rawX = entry['x'] ?? entry['label'] ?? entry['name'] ?? entry['category'];
      const x = scatter ? num(rawX) : (text(rawX, ANSWER_UI_LIMITS.labelLength) ?? num(rawX));
      const y = chartValue(entry['y'] ?? entry['value'] ?? entry['amount']);
      if (x !== undefined && y !== undefined) points.push({ x, y });
      return;
    }
    const y = chartValue(entry);
    const x = scatter ? index + 1 : (labels[index] ?? String(index + 1));
    if (y !== undefined) points.push({ x, y });
  });
  return points.slice(0, ANSWER_UI_LIMITS.chartPoints);
}

function chartBlock(raw: Raw, builder: Builder, typeHint: string): AnswerUiBlock | null {
  const declared = String(
    raw['chart'] ?? raw['chartType'] ?? raw['chart_type'] ?? raw['variant'] ?? typeHint,
  ).toLowerCase();
  const chart = CHART_TYPE_ALIASES[declared] ?? 'bar';
  const scatter = chart === 'scatter';
  const labels = (list(raw, ['labels', 'categories', 'x']) ?? [])
    .map((label) => text(label, ANSWER_UI_LIMITS.labelLength))
    .filter((label): label is string => Boolean(label));
  const rawSeries = list(raw, ['series', 'datasets']);
  let series: AnswerUiChartSeries[] = [];
  if (rawSeries) {
    series = rawSeries.filter(isRaw).map((entry, index) => ({
      name:
        firstText(entry, ['name', 'label', 'title'], ANSWER_UI_LIMITS.labelLength) ??
        `Series ${index + 1}`,
      points: seriesPoints(entry, labels, scatter),
    }));
  } else {
    const single = list(raw, ['data', 'values', 'points']);
    if (single) {
      series = [
        {
          name:
            firstText(raw, ['yLabel', 'seriesName', 'title'], ANSWER_UI_LIMITS.labelLength) ??
            'Value',
          points: seriesPoints({ values: single }, labels, scatter),
        },
      ];
    }
  }
  series = series.filter((entry) => entry.points.length > 0).slice(0, ANSWER_UI_LIMITS.chartSeries);
  if (series.length === 0) return null;
  if (
    scatter &&
    series.some((entry) => entry.points.some((point) => typeof point.x !== 'number'))
  ) {
    return null;
  }
  const xLabel = firstText(raw, ['xLabel', 'x_label', 'xAxis'], ANSWER_UI_LIMITS.labelLength);
  const yLabel = firstText(raw, ['yLabel', 'y_label', 'yAxis'], ANSWER_UI_LIMITS.labelLength);
  return {
    type: 'chart',
    id: claimId(builder, raw['id'], 'chart'),
    title: firstText(raw, ['title', 'caption', 'label'], ANSWER_UI_LIMITS.titleLength) ?? 'Chart',
    chart,
    ...(xLabel ? { xLabel } : {}),
    ...(yLabel ? { yLabel } : {}),
    series,
  };
}

function checklistBlock(raw: Raw, builder: Builder): AnswerUiBlock | null {
  const entries = (list(raw, ['items', 'tasks', 'steps', 'options']) ?? [])
    .map((entry) =>
      isRaw(entry)
        ? {
            label: firstText(
              entry,
              ['label', 'text', 'title', 'task', 'name'],
              ANSWER_UI_LIMITS.labelLength,
            ),
            checked: bool(entry['checked'] ?? entry['done'] ?? entry['completed']) ?? false,
            id: entry['id'],
          }
        : { label: text(entry, ANSWER_UI_LIMITS.labelLength), checked: false, id: undefined },
    )
    .filter((entry): entry is { label: string; checked: boolean; id: unknown } =>
      Boolean(entry.label),
    )
    .slice(0, ANSWER_UI_LIMITS.checklistItems);
  if (entries.length === 0) return null;
  const ids = uniqueItemIds(entries, (entry, index) =>
    typeof entry.id === 'string' ? entry.id : `item_${index + 1}`,
  );
  const title = firstText(raw, ['title', 'label'], ANSWER_UI_LIMITS.titleLength);
  const id = claimId(builder, raw['id'], title ?? 'checklist');
  alias(builder, id, title);
  return {
    type: 'checklist',
    id,
    ...(title ? { title } : {}),
    items: entries.map((entry, index) => ({
      id: ids[index]!,
      label: entry.label,
      checked: entry.checked,
    })),
  };
}

function choiceStyle(raw: Raw, typeHint: string): AnswerUiChoiceStyle {
  const declared = String(
    raw['style'] ?? raw['variant'] ?? raw['mode'] ?? raw['kind'] ?? typeHint,
  ).toLowerCase();
  if (declared.includes('check') || declared.includes('multi') || bool(raw['multiple']) === true) {
    return 'checkbox';
  }
  if (declared.includes('drop') || declared.includes('select')) return 'dropdown';
  return 'radio';
}

function choiceBlock(raw: Raw, builder: Builder, typeHint: string): AnswerUiBlock | null {
  const entries = (list(raw, ['options', 'choices', 'items']) ?? [])
    .map((entry) =>
      isRaw(entry)
        ? {
            label: firstText(
              entry,
              ['label', 'text', 'title', 'name', 'value'],
              ANSWER_UI_LIMITS.labelLength,
            ),
            description: firstText(entry, ['description', 'detail'], ANSWER_UI_LIMITS.labelLength),
            key: entry['id'] ?? entry['value'],
          }
        : {
            label: text(entry, ANSWER_UI_LIMITS.labelLength),
            description: undefined,
            key: undefined,
          },
    )
    .filter((entry): entry is { label: string; description: string | undefined; key: unknown } =>
      Boolean(entry.label),
    )
    .slice(0, ANSWER_UI_LIMITS.choiceOptions);
  if (entries.length < 2) return null;
  const optionIds = uniqueItemIds(entries, (entry) =>
    typeof entry.key === 'string' && entry.key ? entry.key : entry.label,
  );
  const style = choiceStyle(raw, typeHint);
  const rawSelected = raw['selected'] ?? raw['default'] ?? raw['defaultValue'] ?? raw['value'];
  const wanted = (
    Array.isArray(rawSelected) ? rawSelected : rawSelected === undefined ? [] : [rawSelected]
  )
    .map((entry) =>
      typeof entry === 'string' || typeof entry === 'number' ? String(entry).toLowerCase() : '',
    )
    .filter(Boolean);
  const selected = optionIds.filter((optionId, index) => {
    const entry = entries[index]!;
    return wanted.some(
      (want) => want === optionId || want === entry.label.toLowerCase() || slug(want) === optionId,
    );
  });
  const label =
    firstText(raw, ['label', 'title', 'question', 'text'], ANSWER_UI_LIMITS.labelLength) ??
    'Choose one';
  const id = claimId(builder, raw['id'], label);
  alias(builder, id, label);
  const readout = firstText(raw, ['readout', 'template'], ANSWER_UI_LIMITS.templateLength);
  return {
    type: 'choice',
    id,
    label,
    style,
    options: entries.map((entry, index) => ({
      id: optionIds[index]!,
      label: entry.label,
      ...(entry.description ? { description: entry.description } : {}),
    })),
    selected: style === 'checkbox' ? selected : selected.slice(0, 1),
    ...(readout ? { readout } : {}),
  };
}

const CURRENCY_UNITS = new Set(['$', '€', '£', '¥', '₹', 'US$', 'C$', 'A$']);

function niceStep(range: number): number {
  if (range <= 0) return 1;
  const rough = range / 100;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function roundToStep(value: number, min: number, step: number): number {
  const snapped = min + Math.round((value - min) / step) * step;
  return Number(snapped.toFixed(10));
}

function sliderBlock(raw: Raw, builder: Builder): AnswerUiBlock | null {
  let min = firstNum(raw, ['min', 'minimum', 'from']) ?? 0;
  let max = firstNum(raw, ['max', 'maximum', 'to']);
  const initial = firstNum(raw, ['value', 'default', 'defaultValue', 'initial', 'start']);
  if (max === undefined) max = initial !== undefined && initial > 0 ? initial * 2 : 100;
  if (min > max) [min, max] = [max, min];
  if (min === max) max = min + 1;
  let step = firstNum(raw, ['step', 'increment']);
  if (step === undefined || step <= 0 || (max - min) / step > 10_000) step = niceStep(max - min);
  let value = Math.max(min, roundToStep(initial ?? min, min, step));
  if (value > max) value = roundToStep(value - step, min, step);
  const label =
    firstText(raw, ['label', 'title', 'name', 'text'], ANSWER_UI_LIMITS.labelLength) ?? 'Value';
  const prefix = text(raw['prefix'], 12);
  const unit = prefix ?? text(raw['unit'] ?? raw['suffix'], 12);
  const id = claimId(builder, raw['id'], label);
  alias(builder, id, label);
  const readout = firstText(raw, ['readout', 'template'], ANSWER_UI_LIMITS.templateLength);
  return {
    type: 'slider',
    id,
    label,
    min,
    max,
    step,
    value,
    ...(unit
      ? { unit, unitPosition: prefix || CURRENCY_UNITS.has(unit) ? 'prefix' : 'suffix' }
      : {}),
    ...(readout ? { readout } : {}),
  };
}

function inputBlock(raw: Raw, builder: Builder, typeHint: string): AnswerUiBlock | null {
  const declared = String(
    raw['inputType'] ?? raw['input_type'] ?? raw['format'] ?? raw['kind'] ?? typeHint,
  ).toLowerCase();
  const inputType: AnswerUiInputType = declared.includes('date')
    ? 'date'
    : declared.includes('number') || declared.includes('numeric')
      ? 'number'
      : 'text';
  const label =
    firstText(raw, ['label', 'title', 'name', 'text'], ANSWER_UI_LIMITS.labelLength) ?? 'Value';
  const id = claimId(builder, raw['id'], label);
  alias(builder, id, label);
  const rawValue = raw['value'] ?? raw['default'] ?? raw['defaultValue'];
  let value = text(rawValue, ANSWER_UI_LIMITS.inputValueLength) ?? '';
  if (inputType === 'number' && value !== '') {
    const parsed = num(value);
    value = parsed === undefined ? '' : String(parsed);
  }
  if (inputType === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) value = '';
  const placeholder = firstText(raw, ['placeholder', 'hint'], ANSWER_UI_LIMITS.labelLength);
  const readout = firstText(raw, ['readout', 'template'], ANSWER_UI_LIMITS.templateLength);
  return {
    type: 'input',
    id,
    label,
    inputType,
    ...(placeholder ? { placeholder } : {}),
    value,
    ...(readout ? { readout } : {}),
  };
}

function readoutBlock(raw: Raw, builder: Builder): AnswerUiBlock | null {
  let value = firstText(
    raw,
    ['value', 'template', 'text', 'formula', 'expression', 'content'],
    ANSWER_UI_LIMITS.templateLength,
  );
  if (!value) return null;
  if (/^=/.test(value) && !value.includes('{')) value = `{${value}}`;
  const label =
    firstText(raw, ['label', 'title', 'name'], ANSWER_UI_LIMITS.labelLength) ?? 'Result';
  return { type: 'readout', id: claimId(builder, raw['id'], label), label, value };
}

function galleryBlock(raw: Raw, builder: Builder): AnswerUiBlock | null {
  let dropped = 0;
  const images = (
    list(raw, ['images', 'items', 'photos']) ?? (raw['url'] || raw['src'] ? [raw] : [])
  )
    .map((entry, index) => {
      const source = isRaw(entry) ? (entry['url'] ?? entry['src'] ?? entry['image']) : entry;
      const url = typeof source === 'string' ? source.trim() : '';
      if (!isAnswerUiHttpsUrl(url)) {
        dropped += 1;
        return null;
      }
      const caption = isRaw(entry)
        ? firstText(entry, ['caption', 'title'], ANSWER_UI_LIMITS.labelLength)
        : undefined;
      const alt =
        (isRaw(entry)
          ? firstText(
              entry,
              ['alt', 'description', 'caption', 'title'],
              ANSWER_UI_LIMITS.labelLength,
            )
          : undefined) ?? `Image ${index + 1}`;
      return { url, alt, ...(caption ? { caption } : {}) };
    })
    .filter((image): image is { url: string; alt: string; caption?: string } => image !== null)
    .slice(0, ANSWER_UI_LIMITS.galleryImages);
  if (dropped > 0) builder.notes.push(`Left out ${dropped} image(s) without an https URL.`);
  if (images.length === 0) return null;
  return { type: 'gallery', id: claimId(builder, raw['id'], 'gallery'), images };
}

export function answerUiPinUrl(label: string, address?: string): string {
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', address ? `${label}, ${address}` : label);
  return url.toString();
}

function mapBlock(raw: Raw, builder: Builder): AnswerUiBlock | null {
  const entries = (list(raw, ['pins', 'markers', 'places', 'locations', 'points']) ?? []).filter(
    isRaw,
  );
  const pins = entries
    .map((entry) => {
      const label = firstText(entry, ['label', 'name', 'title'], ANSWER_UI_LIMITS.labelLength);
      const latitude = firstNum(entry, ['latitude', 'lat']);
      const longitude = firstNum(entry, ['longitude', 'lng', 'lon', 'long']);
      if (
        !label ||
        latitude === undefined ||
        longitude === undefined ||
        Math.abs(latitude) > 85.05112878 ||
        Math.abs(longitude) > 180
      ) {
        return null;
      }
      const note = firstText(
        entry,
        ['note', 'description', 'detail'],
        ANSWER_UI_LIMITS.labelLength,
      );
      const address = firstText(entry, ['address'], ANSWER_UI_LIMITS.labelLength);
      return {
        label,
        latitude,
        longitude,
        note: note ?? address,
        url: answerUiPinUrl(label, address),
        key: entry['id'],
      };
    })
    .filter((pin): pin is NonNullable<typeof pin> => pin !== null)
    .slice(0, ANSWER_UI_LIMITS.mapPins);
  if (pins.length === 0) return null;
  const ids = uniqueItemIds(pins, (pin, index) =>
    typeof pin.key === 'string' ? pin.key : `pin_${index + 1}`,
  );
  return {
    type: 'map',
    id: claimId(builder, raw['id'], 'map'),
    title: firstText(raw, ['title', 'label', 'caption'], ANSWER_UI_LIMITS.titleLength) ?? 'Map',
    pins: pins.map((pin, index) => ({
      id: ids[index]!,
      label: pin.label,
      latitude: pin.latitude,
      longitude: pin.longitude,
      ...(pin.note ? { note: pin.note } : {}),
      url: pin.url,
    })),
  };
}

function actionsBlock(raw: Raw, builder: Builder): AnswerUiBlock | null {
  const entries = (
    list(raw, ['buttons', 'actions', 'items']) ?? (raw['label'] ? [raw] : [])
  ).filter(isRaw);
  const buttons: Omit<AnswerUiActionButton, 'id'>[] = [];
  for (const entry of entries) {
    const label = firstText(entry, ['label', 'text', 'title'], ANSWER_UI_LIMITS.labelLength);
    if (!label) continue;
    const declared = String(entry['action'] ?? entry['type'] ?? entry['kind'] ?? '').toLowerCase();
    const url =
      typeof (entry['url'] ?? entry['href']) === 'string'
        ? String(entry['url'] ?? entry['href']).trim()
        : '';
    const template = firstText(
      entry,
      ['message', 'template', 'prompt', 'send', 'copy', 'text', 'value'],
      ANSWER_UI_LIMITS.templateLength,
    );
    const action =
      declared === 'reset'
        ? 'reset'
        : declared === 'copy' || (declared === '' && entry['copy'] !== undefined)
          ? 'copy'
          : declared === 'link' || declared === 'open' || (declared === '' && url)
            ? 'link'
            : 'send';
    if (action === 'link' && !isAnswerUiHttpsUrl(url)) continue;
    if (action === 'copy' && !template) continue;
    buttons.push({
      label,
      action,
      ...(action === 'send' || action === 'copy' ? (template ? { template } : {}) : {}),
      ...(action === 'link' ? { url } : {}),
      primary: bool(entry['primary']) ?? String(entry['style'] ?? '').toLowerCase() === 'primary',
    });
    if (buttons.length === ANSWER_UI_LIMITS.actionsPerBlock) break;
  }
  if (buttons.length === 0) return null;
  if (!buttons.some((button) => button.primary)) {
    const firstSend = buttons.find((button) => button.action === 'send');
    if (firstSend) firstSend.primary = true;
  }
  return {
    type: 'actions',
    id: claimId(builder, raw['id'], 'actions'),
    buttons: buttons.map((button) => ({
      id: claimId(builder, undefined, button.label),
      ...button,
    })),
  };
}

const STATUS_TONE_PATTERNS: ReadonlyArray<[RegExp, AnswerUiStatusTone]> = [
  [/fail|error|blocked|broken|down|missing|not met|rejected/i, 'danger'],
  [/pend|progress|warn|risk|review|partial|waiting|draft|degraded/i, 'warning'],
  [/pass|done|complete|success|ok|ready|live|met|approved|shipped|active/i, 'success'],
];

function statusTone(declared: unknown, status: string | undefined): AnswerUiStatusTone {
  const key = typeof declared === 'string' ? declared.toLowerCase() : '';
  if (key === 'success' || key === 'danger' || key === 'warning' || key === 'neutral') return key;
  if (TONES[key] && TONES[key] !== 'info') return TONES[key] as AnswerUiStatusTone;
  if (!status) return 'neutral';
  return STATUS_TONE_PATTERNS.find(([pattern]) => pattern.test(status))?.[1] ?? 'neutral';
}

function rawItems(raw: Raw, keys: readonly string[]): Raw[] {
  return (list(raw, keys) ?? []).map((entry) =>
    isRaw(entry) ? entry : { label: entry, text: entry },
  );
}

function statusBlock(raw: Raw, builder: Builder): AnswerUiBlock | null {
  const entries = rawItems(raw, ['items', 'statuses', 'rows', 'labels'])
    .map((entry) => {
      const label = firstText(
        entry,
        ['label', 'name', 'title', 'text'],
        ANSWER_UI_LIMITS.labelLength,
      );
      const status = firstText(entry, ['status', 'badge', 'state', 'value', 'result'], 40);
      if (!label) return null;
      return {
        label,
        status: status ?? label,
        tone: statusTone(entry['tone'] ?? entry['color'], status ?? label),
        note: firstText(entry, ['note', 'description', 'detail'], ANSWER_UI_LIMITS.labelLength),
        key: entry['id'],
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .slice(0, ANSWER_UI_LIMITS.listItems);
  if (entries.length === 0) return null;
  const ids = uniqueItemIds(entries, (entry) =>
    typeof entry.key === 'string' ? entry.key : entry.label,
  );
  const title = firstText(raw, ['title', 'label'], ANSWER_UI_LIMITS.titleLength);
  return {
    type: 'status',
    id: claimId(builder, raw['id'], 'status'),
    ...(title ? { title } : {}),
    items: entries.map((entry, index) => ({
      id: ids[index]!,
      label: entry.label,
      status: entry.status,
      tone: entry.tone,
      ...(entry.note ? { note: entry.note } : {}),
    })),
  };
}

function stepsBlock(raw: Raw, builder: Builder): AnswerUiBlock | null {
  const entries = rawItems(raw, ['items', 'steps', 'events', 'stages'])
    .map((entry) => {
      const title = firstText(
        entry,
        ['label', 'title', 'name', 'step'],
        ANSWER_UI_LIMITS.labelLength,
      );
      const text = safeMarkdown(
        entry['text'] ?? entry['description'] ?? entry['detail'],
        ANSWER_UI_LIMITS.textLength,
      );
      const heading = title ?? (text ? text.slice(0, ANSWER_UI_LIMITS.labelLength) : undefined);
      if (!heading) return null;
      const status = firstText(entry, ['status', 'badge', 'state'], 40);
      return {
        title: heading,
        ...(text && text !== heading ? { text } : {}),
        ...(status ? { status, tone: statusTone(entry['tone'], status) } : {}),
        key: entry['id'],
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .slice(0, ANSWER_UI_LIMITS.listItems);
  if (entries.length === 0) return null;
  const ids = uniqueItemIds(entries, (_, index) => `step_${index + 1}`);
  const title = firstText(raw, ['title', 'label'], ANSWER_UI_LIMITS.titleLength);
  return {
    type: 'steps',
    id: claimId(builder, raw['id'], 'steps'),
    ...(title ? { title } : {}),
    items: entries.map(({ key: _key, ...entry }, index) => ({ id: ids[index]!, ...entry })),
  };
}

function keyValueBlock(raw: Raw, builder: Builder): AnswerUiBlock | null {
  const source = list(raw, ['items', 'pairs', 'rows', 'fields']);
  const pairs = source
    ? source.map((entry) =>
        Array.isArray(entry)
          ? { label: text(entry[0], ANSWER_UI_LIMITS.labelLength), value: cellText(entry[1]) }
          : isRaw(entry)
            ? {
                label: firstText(
                  entry,
                  ['label', 'key', 'name', 'title'],
                  ANSWER_UI_LIMITS.labelLength,
                ),
                value: cellText(entry['value'] ?? entry['text'] ?? entry['detail']),
              }
            : { label: undefined, value: '' },
      )
    : isRaw(raw['data'])
      ? Object.entries(raw['data']).map(([key, value]) => ({
          label: text(key, ANSWER_UI_LIMITS.labelLength),
          value: cellText(value),
        }))
      : [];
  const items = pairs
    .filter((pair): pair is { label: string; value: string } => Boolean(pair.label))
    .slice(0, ANSWER_UI_LIMITS.listItems);
  if (items.length === 0) return null;
  const title = firstText(raw, ['title', 'label'], ANSWER_UI_LIMITS.titleLength);
  return {
    type: 'keyvalue',
    id: claimId(builder, raw['id'], 'details'),
    ...(title ? { title } : {}),
    items,
  };
}

function copyBlock(raw: Raw, builder: Builder): AnswerUiBlock | null {
  const body = text(
    raw['text'] ?? raw['content'] ?? raw['value'] ?? raw['prompt'] ?? raw['code'],
    ANSWER_UI_LIMITS.copyTextLength,
  );
  if (!body) return null;
  const title = firstText(raw, ['title', 'label'], ANSWER_UI_LIMITS.titleLength);
  const badge = firstText(raw, ['badge', 'tag'], 40);
  return {
    type: 'copy',
    id: claimId(builder, raw['id'], title ?? 'copy'),
    ...(title ? { title } : {}),
    ...(badge ? { badge } : {}),
    text: body,
    buttonLabel:
      firstText(raw, ['buttonLabel', 'button', 'action'], ANSWER_UI_LIMITS.labelLength) ?? 'Copy',
  };
}

function suggestionsBlock(raw: Raw, builder: Builder): AnswerUiBlock | null {
  const items = rawItems(raw, ['items', 'suggestions', 'options', 'prompts'])
    .map((entry) =>
      firstText(
        entry,
        ['text', 'label', 'prompt', 'message', 'title'],
        ANSWER_UI_LIMITS.labelLength,
      ),
    )
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, ANSWER_UI_LIMITS.suggestions);
  if (items.length === 0) return null;
  return {
    type: 'suggestions',
    id: claimId(builder, raw['id'], 'suggestions'),
    items: items.map((entry) => ({ id: claimId(builder, undefined, entry), text: entry })),
  };
}

function fileType(name: string, declared: string | undefined): string {
  if (declared) return declared.replace(/^\./, '').toUpperCase().slice(0, 40);
  const extension = /\.([a-z0-9]{1,8})$/i.exec(name)?.[1];
  return extension ? extension.toUpperCase() : 'File';
}

function filesBlock(raw: Raw, builder: Builder): AnswerUiBlock | null {
  const entries = rawItems(raw, ['items', 'files', 'attachments'])
    .map((entry) => {
      const name = firstText(
        entry,
        ['name', 'filename', 'title', 'label'],
        ANSWER_UI_LIMITS.labelLength,
      );
      if (!name) return null;
      const url =
        typeof (entry['url'] ?? entry['href']) === 'string'
          ? String(entry['url'] ?? entry['href']).trim()
          : '';
      return {
        name,
        fileType: fileType(
          name,
          firstText(entry, ['fileType', 'file_type', 'type', 'format', 'kind'], 40),
        ),
        description: firstText(
          entry,
          ['description', 'text', 'note', 'detail'],
          ANSWER_UI_LIMITS.labelLength,
        ),
        ...(isAnswerUiHttpsUrl(url) ? { url } : {}),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .slice(0, ANSWER_UI_LIMITS.listItems);
  if (entries.length === 0) return null;
  const ids = uniqueItemIds(entries, (entry) => entry.name);
  const title = firstText(raw, ['title', 'label'], ANSWER_UI_LIMITS.titleLength);
  return {
    type: 'files',
    id: claimId(builder, raw['id'], 'files'),
    ...(title ? { title } : {}),
    items: entries.map(({ description, ...entry }, index) => ({
      id: ids[index]!,
      ...entry,
      ...(description ? { description } : {}),
    })),
  };
}

function transcriptBlock(raw: Raw, builder: Builder): AnswerUiBlock | null {
  const items = rawItems(raw, ['items', 'lines', 'entries', 'segments'])
    .map((entry) => {
      const line = text(
        entry['text'] ?? entry['line'] ?? entry['content'] ?? entry['label'],
        ANSWER_UI_LIMITS.textLength,
      );
      if (!line) return null;
      const time = firstText(entry, ['time', 'timestamp', 'at'], 16);
      const speaker = firstText(entry, ['speaker', 'name', 'who'], 60);
      return { ...(time ? { time } : {}), ...(speaker ? { speaker } : {}), text: line };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .slice(0, ANSWER_UI_LIMITS.tableRows);
  if (items.length === 0) return null;
  const title = firstText(raw, ['title', 'label'], ANSWER_UI_LIMITS.titleLength);
  return {
    type: 'transcript',
    id: claimId(builder, raw['id'], 'transcript'),
    ...(title ? { title } : {}),
    items,
  };
}

function resolveType(raw: Raw): { type: string; hint: string } | null {
  const declared = raw['type'] ?? raw['kind'] ?? raw['block'] ?? raw['component'];
  if (typeof declared !== 'string') {
    if (raw['rows'] || raw['headers']) return { type: 'table', hint: 'table' };
    if (raw['text'] || raw['markdown'] || raw['content']) return { type: 'text', hint: 'text' };
    if (raw['title'] && (raw['subtitle'] || raw['blocks'])) return { type: 'card', hint: 'card' };
    return null;
  }
  const hint = declared
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return { type: TYPE_ALIASES[hint] ?? hint, hint };
}

function containerBlock(
  raw: Raw,
  builder: Builder,
  type: 'card' | 'columns' | 'disclosure',
  depth: number,
): AnswerUiBlock[] {
  const rawChildren = childList(
    raw,
    type === 'columns'
      ? ['blocks', 'columns', 'children', 'items', 'cards', 'content']
      : ['blocks', 'children', 'content', 'items', 'cards'],
  );
  if (depth + 1 >= ANSWER_UI_LIMITS.maxDepth) {
    return normalizeBlocks(rawChildren, builder, depth);
  }
  if (type === 'columns') {
    const columnChildren = rawChildren.map((child) => {
      if (Array.isArray(child)) return { type: 'card', blocks: child };
      if (isRaw(child) && !child['type'] && !child['kind']) return { type: 'card', ...child };
      return child;
    });
    const chunks: unknown[][] = [];
    for (let index = 0; index < columnChildren.length; index += ANSWER_UI_COLUMNS_MAX) {
      chunks.push(columnChildren.slice(index, index + ANSWER_UI_COLUMNS_MAX));
    }
    return chunks.flatMap((chunk) => {
      const id = claimId(builder, chunks.length === 1 ? raw['id'] : undefined, 'columns');
      builder.nodes += 1;
      const blocks = normalizeBlocks(chunk, builder, depth + 1);
      if (blocks.length < ANSWER_UI_COLUMNS_MIN) {
        builder.ids.delete(id);
        builder.nodes -= 1;
        return blocks;
      }
      return [{ type: 'columns', id, blocks } satisfies AnswerUiBlock];
    });
  }
  const title = firstText(
    raw,
    ['title', 'summary', 'label', 'heading'],
    ANSWER_UI_LIMITS.titleLength,
  );
  const id = claimId(builder, raw['id'], title ?? type);
  builder.nodes += 1;
  const blocks = normalizeBlocks(rawChildren, builder, depth + 1);
  if (type === 'disclosure') {
    if (blocks.length === 0) {
      builder.ids.delete(id);
      builder.nodes -= 1;
      return [];
    }
    return [
      {
        type: 'disclosure',
        id,
        summary: title ?? 'Details',
        open: bool(raw['open'] ?? raw['expanded']) ?? false,
        blocks,
      },
    ];
  }
  const subtitle = firstText(
    raw,
    ['subtitle', 'price', 'description'],
    ANSWER_UI_LIMITS.labelLength,
  );
  const badge = firstText(raw, ['badge', 'tag', 'status'], 40);
  if (list(raw, ['buttons', 'actions']) && builder.nodes < ANSWER_UI_LIMITS.maxNodes) {
    const actions = actionsBlock({ buttons: list(raw, ['buttons', 'actions']) }, builder);
    if (actions) {
      builder.nodes += 1;
      blocks.push(actions);
    }
  }
  if (!title && !subtitle && blocks.length === 0) {
    builder.ids.delete(id);
    builder.nodes -= 1;
    return [];
  }
  return [
    {
      type: 'card',
      id,
      ...(title ? { title } : {}),
      ...(subtitle ? { subtitle } : {}),
      ...(badge ? { badge, badgeTone: statusTone(raw['badgeTone'] ?? raw['tone'], badge) } : {}),
      blocks,
    },
  ];
}

function normalizeBlock(raw: unknown, builder: Builder, depth: number): AnswerUiBlock[] {
  if (typeof raw === 'string') return normalizeBlock({ type: 'text', text: raw }, builder, depth);
  if (!isRaw(raw)) return [];
  const resolved = resolveType(raw);
  if (!resolved) return [];
  const { type, hint } = resolved;
  if (type === 'card' || type === 'columns' || type === 'disclosure') {
    return containerBlock(raw, builder, type, depth);
  }
  if (builder.nodes >= ANSWER_UI_LIMITS.maxNodes) return [];
  const block =
    type === 'heading'
      ? headingBlock(raw, builder)
      : type === 'text'
        ? textBlock(raw, builder)
        : type === 'callout'
          ? calloutBlock(raw, builder, hint)
          : type === 'table'
            ? tableBlock(raw, builder)
            : type === 'chart'
              ? chartBlock(raw, builder, hint)
              : type === 'checklist'
                ? checklistBlock(raw, builder)
                : type === 'choice'
                  ? choiceBlock(raw, builder, hint)
                  : type === 'slider'
                    ? sliderBlock(raw, builder)
                    : type === 'input'
                      ? inputBlock(raw, builder, hint)
                      : type === 'readout'
                        ? readoutBlock(raw, builder)
                        : type === 'gallery'
                          ? galleryBlock(raw, builder)
                          : type === 'map'
                            ? mapBlock(raw, builder)
                            : type === 'actions'
                              ? actionsBlock(raw, builder)
                              : type === 'status'
                                ? statusBlock(raw, builder)
                                : type === 'steps'
                                  ? stepsBlock(raw, builder)
                                  : type === 'keyvalue'
                                    ? keyValueBlock(raw, builder)
                                    : type === 'copy'
                                      ? copyBlock(raw, builder)
                                      : type === 'suggestions'
                                        ? suggestionsBlock(raw, builder)
                                        : type === 'files'
                                          ? filesBlock(raw, builder)
                                          : type === 'transcript'
                                            ? transcriptBlock(raw, builder)
                                            : textBlock(raw, builder);
  if (!block) {
    builder.notes.push(`Left out a ${hint} block that had nothing usable in it.`);
    return [];
  }
  builder.nodes += 1;
  return [block];
}

function normalizeBlocks(
  raw: readonly unknown[],
  builder: Builder,
  depth: number,
): AnswerUiBlock[] {
  const blocks: AnswerUiBlock[] = [];
  for (const entry of raw) {
    if (builder.nodes >= ANSWER_UI_LIMITS.maxNodes) {
      builder.notes.push(`Stopped at ${ANSWER_UI_LIMITS.maxNodes} blocks; the rest were left out.`);
      break;
    }
    blocks.push(...normalizeBlock(entry, builder, depth));
  }
  return blocks;
}

const TEMPLATE_SLOT = /\{\{?\s*(=?)\s*([^{}]*?)\s*\}?\}/g;
const IDENTIFIER = /[A-Za-z][A-Za-z0-9_]*/g;

function controlResolver(
  builder: Builder,
  controls: ReadonlyMap<string, AnswerUiControlBlock>,
): (name: string) => string | undefined {
  return (name) => {
    const key = slug(name);
    if (controls.has(key)) return key;
    const aliased = builder.aliases.get(key);
    return aliased && controls.has(aliased) ? aliased : undefined;
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rewriteNames(
  source: string,
  builder: Builder,
  controls: ReadonlyMap<string, AnswerUiControlBlock>,
): string {
  const resolveId = controlResolver(builder, controls);
  const whole = resolveId(source.trim());
  if (whole) return whole;
  const labels = [...controls.values()]
    .map((control) => ({
      id: control.id,
      label: control.type === 'checklist' ? control.title : control.label,
    }))
    .filter((entry): entry is { id: string; label: string } => Boolean(entry.label?.includes(' ')))
    .sort((a, b) => b.label.length - a.label.length);
  let rewritten = source;
  for (const { id, label } of labels) {
    rewritten = rewritten.replace(new RegExp(`\\b${escapeRegExp(label)}\\b`, 'gi'), id);
  }
  return rewritten.replace(IDENTIFIER, (name) => resolveId(name) ?? name);
}

function repairTemplate(
  template: string,
  builder: Builder,
  controls: ReadonlyMap<string, AnswerUiControlBlock>,
): string | undefined {
  const resolveId = controlResolver(builder, controls);
  let broken = false;
  const repaired = template.replace(TEMPLATE_SLOT, (whole, computed: string, inner: string) => {
    if (computed === '=') {
      const rewritten = rewriteNames(inner, builder, controls);
      const expression = parseAnswerUiExpression(rewritten);
      if (!expression || !collectRefs(rewritten).every((id) => controls.has(id))) {
        broken = true;
        return '';
      }
      return `{= ${rewritten}}`;
    }
    const id = resolveId(inner);
    if (id) return `{${id}}`;
    if (/^[\w\s-]+$/.test(inner) && /[a-z]/i.test(inner)) {
      const rewritten = rewriteNames(inner, builder, controls);
      if (
        /[-+*/]/.test(rewritten) &&
        parseAnswerUiExpression(rewritten) &&
        collectRefs(rewritten).every((ref) => controls.has(ref))
      ) {
        return `{= ${rewritten}}`;
      }
      broken = true;
      return '';
    }
    return whole;
  });
  if (broken) builder.notes.push('Removed template slots that named no control.');
  const withoutDoubledUnits = [...controls.values()].reduce((current, control) => {
    if (control.type !== 'slider' || control.unitPosition !== 'prefix' || !control.unit)
      return current;
    return current.split(`${control.unit}{${control.id}}`).join(`{${control.id}}`);
  }, repaired);
  const trimmed = withoutDoubledUnits.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function repairBindings(body: AnswerUiCardBody, builder: Builder): void {
  const controls = answerUiControls(body);
  const numeric = new Set(
    [...controls.values()]
      .filter(
        (control) =>
          control.type === 'slider' ||
          control.type === 'checklist' ||
          (control.type === 'input' && control.inputType === 'number'),
      )
      .map((control) => control.id),
  );
  const fix = (template: string | undefined) =>
    template === undefined ? undefined : repairTemplate(template, builder, controls);
  const visit = (blocks: AnswerUiBlock[]): AnswerUiBlock[] =>
    blocks.flatMap((block): AnswerUiBlock[] => {
      if (isAnswerUiContainer(block)) {
        return [{ ...block, blocks: visit(block.blocks) } as AnswerUiBlock];
      }
      if (block.type === 'choice' || block.type === 'slider' || block.type === 'input') {
        const { readout, ...rest } = block;
        const fixed = fix(readout);
        return [{ ...rest, ...(fixed ? { readout: fixed } : {}) } as AnswerUiBlock];
      }
      if (block.type === 'readout') {
        const value = fix(block.value);
        return value ? [{ ...block, value }] : [];
      }
      if (block.type === 'actions') {
        const buttons = block.buttons
          .flatMap((button) => {
            if (button.template === undefined) return [button];
            const template = fix(button.template);
            if (template) return [{ ...button, template }];
            return button.action === 'copy' ? [] : [{ ...button, template: undefined }];
          })
          .map(({ template, ...rest }) => ({ ...rest, ...(template ? { template } : {}) }));
        return buttons.length > 0 ? [{ ...block, buttons }] : [];
      }
      if (block.type === 'chart') {
        const series = block.series
          .map((entry) => ({
            ...entry,
            points: entry.points.flatMap((point) => {
              if (typeof point.y === 'number') return [point];
              const rewritten = rewriteNames(point.y.replace(/^\s*=/, ''), builder, controls);
              const expression = parseAnswerUiExpression(rewritten.trim());
              const refs = expression ? collectRefs(rewritten) : [];
              return expression && refs.every((id) => numeric.has(id))
                ? [{ ...point, y: `=${rewritten.trim()}` }]
                : [];
            }),
          }))
          .filter((entry) => entry.points.length > 0);
        return series.length > 0 ? [{ ...block, series }] : [];
      }
      return [block];
    });
  body.blocks = visit(body.blocks);
}

function collectRefs(source: string): string[] {
  return [...source.matchAll(IDENTIFIER)].map((match) => match[0].toLowerCase());
}

const FALLBACK_INDENT = '  ';

function plainChart(
  block: Extract<AnswerUiBlock, { type: 'chart' }>,
  values: AnswerUiValues,
  controls: ReadonlyMap<string, AnswerUiControlBlock>,
): string[] {
  return [
    `${block.title} (${block.chart} chart)`,
    ...block.series.map(
      (series) =>
        `${series.name}: ${series.points
          .map((point) => {
            const y = resolveAnswerUiNumber(point.y, controls, values);
            return `${point.x} ${y === null ? '?' : y}`;
          })
          .join(', ')}`,
    ),
  ];
}

export function answerUiFallbackText(body: AnswerUiCardBody): string {
  const controls = answerUiControls(body);
  const values = answerUiInitialValues(body);
  const lines: string[] = [];
  const write = (blocks: AnswerUiBlock[], indent: string) => {
    for (const block of blocks) {
      const add = (...entries: string[]) =>
        lines.push(...entries.map((entry) => `${indent}${entry}`));
      switch (block.type) {
        case 'heading':
          add(block.text);
          break;
        case 'text':
          add(block.markdown);
          break;
        case 'callout':
          add(block.title ? `${block.title}: ${block.markdown}` : block.markdown);
          break;
        case 'card':
          add([block.title, block.subtitle, block.badge].filter(Boolean).join(' · '));
          write(block.blocks, indent + FALLBACK_INDENT);
          break;
        case 'columns':
          write(block.blocks, indent);
          break;
        case 'disclosure':
          add(block.summary);
          write(block.blocks, indent + FALLBACK_INDENT);
          break;
        case 'table':
          if (block.caption) add(block.caption);
          add(
            ...block.rows.map((row) =>
              row.map((cell, index) => `${block.columns[index]}: ${cell || '-'}`).join('; '),
            ),
          );
          break;
        case 'chart':
          add(...plainChart(block, values, controls));
          break;
        case 'checklist':
          if (block.title) add(block.title);
          add(...block.items.map((item) => `- [${item.checked ? 'x' : ' '}] ${item.label}`));
          break;
        case 'choice':
          add(
            `${block.label}: ${block.options.map((option) => option.label).join(' / ')}`,
            ...(block.readout ? [renderAnswerUiTemplate(block.readout, controls, values)] : []),
          );
          break;
        case 'slider':
          add(
            `${block.label}: ${renderAnswerUiTemplate(`{${block.id}}`, controls, values)} (from ${block.min} to ${block.max})`,
            ...(block.readout ? [renderAnswerUiTemplate(block.readout, controls, values)] : []),
          );
          break;
        case 'input':
          add(`${block.label}: ${block.value || block.placeholder || ''}`.trim());
          break;
        case 'readout':
          add(`${block.label}: ${renderAnswerUiTemplate(block.value, controls, values)}`);
          break;
        case 'gallery':
          add(...block.images.map((image) => `${image.caption ?? image.alt}: ${image.url}`));
          break;
        case 'map':
          add(
            block.title,
            ...block.pins.map(
              (pin) => `- ${pin.label}${pin.note ? `, ${pin.note}` : ''}: ${pin.url}`,
            ),
          );
          break;
        case 'actions':
          break;
        case 'status':
          if (block.title) add(block.title);
          add(
            ...block.items.map(
              (item) => `- ${item.label}: ${item.status}${item.note ? ` (${item.note})` : ''}`,
            ),
          );
          break;
        case 'steps':
          if (block.title) add(block.title);
          add(
            ...block.items.map(
              (item, index) =>
                `${index + 1}. ${item.title}${item.status ? ` [${item.status}]` : ''}${item.text ? `: ${item.text}` : ''}`,
            ),
          );
          break;
        case 'keyvalue':
          if (block.title) add(block.title);
          add(...block.items.map((item) => `${item.label}: ${item.value}`));
          break;
        case 'copy':
          if (block.title) add(block.title);
          add(block.text);
          break;
        case 'suggestions':
          add(...block.items.map((item) => `> ${item.text}`));
          break;
        case 'files':
          if (block.title) add(block.title);
          add(
            ...block.items.map(
              (item) =>
                `- ${item.name} (${item.fileType})${item.description ? `: ${item.description}` : ''}${item.url ? ` ${item.url}` : ''}`,
            ),
          );
          break;
        case 'transcript':
          if (block.title) add(block.title);
          add(
            ...block.items.map((item) =>
              [item.time ? `[${item.time}]` : '', item.speaker ? `${item.speaker}:` : '', item.text]
                .filter(Boolean)
                .join(' '),
            ),
          );
          break;
      }
    }
  };
  write(body.blocks, '');
  const joined = lines.filter((line) => line.trim().length > 0).join('\n');
  return joined.length > ANSWER_UI_LIMITS.fallbackTextLength
    ? `${joined.slice(0, ANSWER_UI_LIMITS.fallbackTextLength - 1).trimEnd()}…`
    : joined;
}

function describeBlocks(body: AnswerUiCardBody): string {
  const counts = new Map<string, number>();
  walkAnswerUiBlocks(body.blocks, (block) =>
    counts.set(block.type, (counts.get(block.type) ?? 0) + 1),
  );
  return [...counts.entries()]
    .map(([type, count]) => (count > 1 ? `${count} ${type}` : type))
    .join(', ');
}

function controlSummary(body: AnswerUiCardBody): string[] {
  return [...answerUiControls(body).values()].map((control) =>
    control.type === 'checklist'
      ? `checklist ${control.id} (${control.items.length} items)`
      : `${control.type} ${control.id} (${control.label})`,
  );
}

export type AnswerUiToolOutcome =
  { ok: true; content: string; card: InteractiveCard } | { ok: false; content: string };

const EMPTY_MESSAGE =
  `${ANSWER_UI_TOOL_NAME} needs at least one block with content, such as {"type":"text","text":"..."}. ` +
  'Answer in plain text instead.';

function buildCard(
  body: AnswerUiCardBody,
  toolCallId: string,
  createdAt: string,
): InteractiveCard | null {
  const raw = {
    schemaVersion: INTERACTIVE_CARD_SCHEMA_VERSION,
    cardId: `answer-ui-${toolCallId}`.slice(0, 128),
    kind: ANSWER_UI_CARD_KIND,
    createdAt,
    fallback: {
      headline: (body.title ?? firstHeadline(body) ?? 'Interactive answer').slice(0, 200),
      text: answerUiFallbackText(body) || body.title || 'Interactive answer',
    },
    producedBy: { toolCallId, toolName: ANSWER_UI_TOOL_NAME },
    body,
  };
  if (JSON.stringify(raw).length > INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH) return null;
  const card = parseInteractiveCardDelta({ card: raw });
  return card?.recognized && card.kind === ANSWER_UI_CARD_KIND ? card : null;
}

function firstHeadline(body: AnswerUiCardBody): string | undefined {
  let found: string | undefined;
  walkAnswerUiBlocks(body.blocks, (block) => {
    if (found) return;
    if (block.type === 'heading') found = block.text;
    else if (block.type === 'card' && block.title) found = block.title;
    else if ((block.type === 'chart' || block.type === 'map') && block.title) found = block.title;
  });
  return found;
}

function invalidTopLevelBlocks(body: AnswerUiCardBody): Set<number> {
  const parsed = AnswerUiCardBodySchema.safeParse(body);
  if (parsed.success) return new Set();
  const indices = new Set<number>();
  for (const issue of parsed.error.issues) {
    const [root, index] = issue.path;
    if (root === 'blocks' && typeof index === 'number') indices.add(index);
    else indices.add(-1);
  }
  return indices;
}

export function normalizeAnswerUiInput(args: Record<string, unknown>): {
  body: AnswerUiCardBody | null;
  notes: string[];
} {
  const builder: Builder = { ids: new Set(), aliases: new Map(), nodes: 0, notes: [] };
  const rawBlocks =
    list(args, ['blocks', 'components', 'ui', 'content', 'children']) ??
    (resolveType(args) ? [args] : []);
  const title = firstText(args, ['title', 'heading'], ANSWER_UI_LIMITS.titleLength);
  const body: AnswerUiCardBody = {
    ...(title ? { title } : {}),
    blocks: normalizeBlocks(rawBlocks, builder, 0),
  };
  repairBindings(body, builder);
  for (let attempt = 0; attempt < 4 && body.blocks.length > 0; attempt += 1) {
    const invalid = invalidTopLevelBlocks(body);
    if (invalid.size === 0) break;
    if (invalid.has(-1)) {
      delete body.title;
      invalid.delete(-1);
    }
    const before = body.blocks.length;
    body.blocks = body.blocks.filter((_, index) => !invalid.has(index));
    builder.notes.push(`Left out ${before - body.blocks.length} block(s) that did not validate.`);
    repairBindings(body, builder);
  }
  if (body.blocks.length === 0 || invalidTopLevelBlocks(body).size > 0) {
    return { body: null, notes: builder.notes };
  }
  return { body, notes: [...new Set(builder.notes)] };
}

export function executeAnswerUiTool(
  args: Record<string, unknown>,
  context: { toolCallId: string; now?: () => Date },
): AnswerUiToolOutcome {
  const { body, notes } = normalizeAnswerUiInput(args);
  if (!body) return { ok: false, content: EMPTY_MESSAGE };
  const createdAt = (context.now?.() ?? new Date()).toISOString();

  let fitted = body;
  let card = buildCard(fitted, context.toolCallId, createdAt);
  let droppedForSize = 0;
  while (!card && fitted.blocks.length > 1) {
    fitted = { ...fitted, blocks: fitted.blocks.slice(0, -1) };
    droppedForSize += 1;
    repairBindings(fitted, { ids: new Set(), aliases: new Map(), nodes: 0, notes });
    card = buildCard(fitted, context.toolCallId, createdAt);
  }
  if (!card) {
    return {
      ok: false,
      content: `${ANSWER_UI_TOOL_NAME} could not fit that UI in one card. Use fewer blocks, or answer in plain text.`,
    };
  }

  const controls = controlSummary(fitted);
  const content = [
    `Rendered the UI below your reply: ${describeBlocks(fitted)}. The user can see and use it now.`,
    ...(controls.length > 0 ? [`Controls: ${controls.join('; ')}.`] : []),
    ...notes,
    ...(droppedForSize > 0
      ? [
          `The last ${droppedForSize} block(s) did not fit and were left out; cover them in text if they matter.`,
        ]
      : []),
    'Do not call this tool again in this reply and do not repeat what the UI shows. Add at most a sentence or two that the UI does not already say.',
  ].join('\n');
  return { ok: true, content, card };
}
