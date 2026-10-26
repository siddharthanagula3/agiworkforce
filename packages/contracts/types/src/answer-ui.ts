export const ANSWER_UI_CARD_KIND = 'answer-ui.v1' as const;
export const ANSWER_UI_TOOL_NAME = 'render_answer_ui';

export const ANSWER_UI_LIMITS = {
  maxNodes: 40,
  maxDepth: 3,
  idLength: 40,
  titleLength: 160,
  labelLength: 160,
  textLength: 2_400,
  tableColumns: 8,
  tableRows: 24,
  cellLength: 240,
  chartSeries: 4,
  chartPoints: 24,
  checklistItems: 24,
  choiceOptions: 8,
  galleryImages: 8,
  mapPins: 10,
  actionsPerBlock: 4,
  listItems: 16,
  suggestions: 5,
  copyTextLength: 4_000,
  templateLength: 600,
  expressionLength: 200,
  inputValueLength: 400,
  urlLength: 2_048,
  messageLength: 2_000,
  fallbackTextLength: 4_000,
} as const;

export const ANSWER_UI_BLOCK_TYPES = [
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
] as const;
export type AnswerUiBlockType = (typeof ANSWER_UI_BLOCK_TYPES)[number];

export const ANSWER_UI_CONTAINER_TYPES = ['card', 'columns', 'disclosure'] as const;
export const ANSWER_UI_CHART_TYPES = ['bar', 'line', 'pie', 'scatter'] as const;
export const ANSWER_UI_CALLOUT_TONES = ['info', 'success', 'warning', 'danger'] as const;
export const ANSWER_UI_STATUS_TONES = ['success', 'danger', 'warning', 'neutral'] as const;
export const ANSWER_UI_CHOICE_STYLES = ['radio', 'checkbox', 'dropdown'] as const;
export const ANSWER_UI_INPUT_TYPES = ['text', 'number', 'date'] as const;
export const ANSWER_UI_ACTION_KINDS = ['send', 'copy', 'link', 'reset'] as const;
export const ANSWER_UI_COLUMNS_MIN = 2;
export const ANSWER_UI_COLUMNS_MAX = 4;

export type AnswerUiChartType = (typeof ANSWER_UI_CHART_TYPES)[number];
export type AnswerUiCalloutTone = (typeof ANSWER_UI_CALLOUT_TONES)[number];
export type AnswerUiStatusTone = (typeof ANSWER_UI_STATUS_TONES)[number];
export type AnswerUiChoiceStyle = (typeof ANSWER_UI_CHOICE_STYLES)[number];
export type AnswerUiInputType = (typeof ANSWER_UI_INPUT_TYPES)[number];
export type AnswerUiActionKind = (typeof ANSWER_UI_ACTION_KINDS)[number];

export interface AnswerUiHeadingBlock {
  type: 'heading';
  id: string;
  text: string;
  level: 2 | 3;
}

export interface AnswerUiTextBlock {
  type: 'text';
  id: string;
  markdown: string;
}

export interface AnswerUiCalloutBlock {
  type: 'callout';
  id: string;
  tone: AnswerUiCalloutTone;
  title?: string;
  markdown: string;
}

export interface AnswerUiCardBlock {
  type: 'card';
  id: string;
  title?: string;
  subtitle?: string;
  badge?: string;
  badgeTone?: AnswerUiStatusTone;
  blocks: AnswerUiBlock[];
}

export interface AnswerUiColumnsBlock {
  type: 'columns';
  id: string;
  blocks: AnswerUiBlock[];
}

export interface AnswerUiDisclosureBlock {
  type: 'disclosure';
  id: string;
  summary: string;
  open: boolean;
  blocks: AnswerUiBlock[];
}

export interface AnswerUiTableBlock {
  type: 'table';
  id: string;
  caption?: string;
  columns: string[];
  rows: string[][];
}

export type AnswerUiNumberOrFormula = number | string;

export interface AnswerUiChartPoint {
  x: string | number;
  y: AnswerUiNumberOrFormula;
}

export interface AnswerUiChartSeries {
  name: string;
  points: AnswerUiChartPoint[];
}

export interface AnswerUiChartBlock {
  type: 'chart';
  id: string;
  title: string;
  chart: AnswerUiChartType;
  xLabel?: string;
  yLabel?: string;
  series: AnswerUiChartSeries[];
}

export interface AnswerUiChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface AnswerUiChecklistBlock {
  type: 'checklist';
  id: string;
  title?: string;
  items: AnswerUiChecklistItem[];
}

export interface AnswerUiChoiceOption {
  id: string;
  label: string;
  description?: string;
}

export interface AnswerUiChoiceBlock {
  type: 'choice';
  id: string;
  label: string;
  style: AnswerUiChoiceStyle;
  options: AnswerUiChoiceOption[];
  selected: string[];
  readout?: string;
}

export interface AnswerUiSliderBlock {
  type: 'slider';
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
  unitPosition?: 'prefix' | 'suffix';
  readout?: string;
}

export interface AnswerUiInputBlock {
  type: 'input';
  id: string;
  label: string;
  inputType: AnswerUiInputType;
  placeholder?: string;
  value: string;
  readout?: string;
}

export interface AnswerUiReadoutBlock {
  type: 'readout';
  id: string;
  label: string;
  value: string;
}

export interface AnswerUiGalleryImage {
  url: string;
  alt: string;
  caption?: string;
}

export interface AnswerUiGalleryBlock {
  type: 'gallery';
  id: string;
  images: AnswerUiGalleryImage[];
}

export interface AnswerUiMapPin {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  note?: string;
  url: string;
}

export interface AnswerUiMapBlock {
  type: 'map';
  id: string;
  title: string;
  pins: AnswerUiMapPin[];
}

export interface AnswerUiActionButton {
  id: string;
  label: string;
  action: AnswerUiActionKind;
  template?: string;
  url?: string;
  primary: boolean;
}

export interface AnswerUiActionsBlock {
  type: 'actions';
  id: string;
  buttons: AnswerUiActionButton[];
}

export interface AnswerUiStatusItem {
  id: string;
  label: string;
  status: string;
  tone: AnswerUiStatusTone;
  note?: string;
}

export interface AnswerUiStatusBlock {
  type: 'status';
  id: string;
  title?: string;
  items: AnswerUiStatusItem[];
}

export interface AnswerUiStep {
  id: string;
  title: string;
  text?: string;
  status?: string;
  tone?: AnswerUiStatusTone;
}

export interface AnswerUiStepsBlock {
  type: 'steps';
  id: string;
  title?: string;
  items: AnswerUiStep[];
}

export interface AnswerUiKeyValueBlock {
  type: 'keyvalue';
  id: string;
  title?: string;
  items: Array<{ label: string; value: string }>;
}

export interface AnswerUiCopyBlock {
  type: 'copy';
  id: string;
  title?: string;
  badge?: string;
  text: string;
  buttonLabel: string;
}

export interface AnswerUiSuggestion {
  id: string;
  text: string;
}

export interface AnswerUiSuggestionsBlock {
  type: 'suggestions';
  id: string;
  items: AnswerUiSuggestion[];
}

export interface AnswerUiFileItem {
  id: string;
  name: string;
  fileType: string;
  description?: string;
  url?: string;
}

export interface AnswerUiFilesBlock {
  type: 'files';
  id: string;
  title?: string;
  items: AnswerUiFileItem[];
}

export interface AnswerUiTranscriptLine {
  time?: string;
  speaker?: string;
  text: string;
}

export interface AnswerUiTranscriptBlock {
  type: 'transcript';
  id: string;
  title?: string;
  items: AnswerUiTranscriptLine[];
}

export type AnswerUiBlock =
  | AnswerUiHeadingBlock
  | AnswerUiTextBlock
  | AnswerUiCalloutBlock
  | AnswerUiCardBlock
  | AnswerUiColumnsBlock
  | AnswerUiDisclosureBlock
  | AnswerUiTableBlock
  | AnswerUiChartBlock
  | AnswerUiChecklistBlock
  | AnswerUiChoiceBlock
  | AnswerUiSliderBlock
  | AnswerUiInputBlock
  | AnswerUiReadoutBlock
  | AnswerUiGalleryBlock
  | AnswerUiMapBlock
  | AnswerUiActionsBlock
  | AnswerUiStatusBlock
  | AnswerUiStepsBlock
  | AnswerUiKeyValueBlock
  | AnswerUiCopyBlock
  | AnswerUiSuggestionsBlock
  | AnswerUiFilesBlock
  | AnswerUiTranscriptBlock;

export type AnswerUiContainerBlock = Extract<AnswerUiBlock, { blocks: AnswerUiBlock[] }>;

export type AnswerUiControlBlock =
  AnswerUiChecklistBlock | AnswerUiChoiceBlock | AnswerUiSliderBlock | AnswerUiInputBlock;

export interface AnswerUiCardBody {
  title?: string;
  blocks: AnswerUiBlock[];
}

export type AnswerUiValue = number | string | string[];
export type AnswerUiValues = Readonly<Record<string, AnswerUiValue>>;

export function isAnswerUiContainer(block: AnswerUiBlock): block is AnswerUiContainerBlock {
  return block.type === 'card' || block.type === 'columns' || block.type === 'disclosure';
}

export function isAnswerUiControl(block: AnswerUiBlock): block is AnswerUiControlBlock {
  return (
    block.type === 'checklist' ||
    block.type === 'choice' ||
    block.type === 'slider' ||
    block.type === 'input'
  );
}

export function walkAnswerUiBlocks(
  blocks: readonly AnswerUiBlock[],
  visit: (block: AnswerUiBlock, depth: number) => void,
  depth = 0,
): void {
  for (const block of blocks) {
    visit(block, depth);
    if (isAnswerUiContainer(block)) walkAnswerUiBlocks(block.blocks, visit, depth + 1);
  }
}

export function answerUiControls(body: AnswerUiCardBody): Map<string, AnswerUiControlBlock> {
  const controls = new Map<string, AnswerUiControlBlock>();
  walkAnswerUiBlocks(body.blocks, (block) => {
    if (isAnswerUiControl(block)) controls.set(block.id, block);
  });
  return controls;
}

export function answerUiActionButtons(body: AnswerUiCardBody): AnswerUiActionButton[] {
  const buttons: AnswerUiActionButton[] = [];
  walkAnswerUiBlocks(body.blocks, (block) => {
    if (block.type === 'actions') buttons.push(...block.buttons);
  });
  return buttons;
}

export function answerUiSuggestions(body: AnswerUiCardBody): AnswerUiSuggestion[] {
  const suggestions: AnswerUiSuggestion[] = [];
  walkAnswerUiBlocks(body.blocks, (block) => {
    if (block.type === 'suggestions') suggestions.push(...block.items);
  });
  return suggestions;
}

export function answerUiSendTargetIds(body: AnswerUiCardBody): string[] {
  return [
    ...answerUiActionButtons(body).map((button) => button.id),
    ...answerUiSuggestions(body).map((suggestion) => suggestion.id),
  ];
}

export function answerUiInitialValue(control: AnswerUiControlBlock): AnswerUiValue {
  switch (control.type) {
    case 'checklist':
      return control.items.filter((item) => item.checked).map((item) => item.id);
    case 'choice':
      return [...control.selected];
    case 'slider':
      return control.value;
    case 'input':
      return control.value;
  }
}

export function answerUiInitialValues(body: AnswerUiCardBody): Record<string, AnswerUiValue> {
  const values: Record<string, AnswerUiValue> = {};
  for (const [id, control] of answerUiControls(body)) values[id] = answerUiInitialValue(control);
  return values;
}

export type AnswerUiExpression =
  | { kind: 'num'; value: number }
  | { kind: 'ref'; id: string }
  | { kind: 'neg'; arg: AnswerUiExpression }
  | { kind: 'bin'; op: '+' | '-' | '*' | '/'; left: AnswerUiExpression; right: AnswerUiExpression };

const EXPRESSION_TOKEN_RE = /\s*(?:(\d+(?:\.\d+)?)|([a-z][a-z0-9_]*)|([-+*/()]))/iy;
const EXPRESSION_MAX_NESTING = 16;

type ExpressionToken = { num: number } | { ref: string } | { op: string };

function tokenizeExpression(source: string): ExpressionToken[] | null {
  const tokens: ExpressionToken[] = [];
  EXPRESSION_TOKEN_RE.lastIndex = 0;
  let index = 0;
  while (index < source.length) {
    if (source.slice(index).trim() === '') break;
    EXPRESSION_TOKEN_RE.lastIndex = index;
    const match = EXPRESSION_TOKEN_RE.exec(source);
    if (!match) return null;
    index = EXPRESSION_TOKEN_RE.lastIndex;
    if (match[1] !== undefined) tokens.push({ num: Number(match[1]) });
    else if (match[2] !== undefined) tokens.push({ ref: match[2].toLowerCase() });
    else if (match[3] !== undefined) tokens.push({ op: match[3] });
  }
  return tokens;
}

export function parseAnswerUiExpression(source: string): AnswerUiExpression | null {
  if (source.length === 0 || source.length > ANSWER_UI_LIMITS.expressionLength) return null;
  const tokens = tokenizeExpression(source);
  if (!tokens || tokens.length === 0) return null;
  let position = 0;
  const peekOp = (): string | undefined => {
    const token = tokens[position];
    return token && 'op' in token ? token.op : undefined;
  };

  const parseSum = (nesting: number): AnswerUiExpression | null => {
    let left = parseProduct(nesting);
    while (left && (peekOp() === '+' || peekOp() === '-')) {
      const op = peekOp() as '+' | '-';
      position += 1;
      const right = parseProduct(nesting);
      left = right ? { kind: 'bin', op, left, right } : null;
    }
    return left;
  };

  const parseProduct = (nesting: number): AnswerUiExpression | null => {
    let left = parseFactor(nesting);
    while (left && (peekOp() === '*' || peekOp() === '/')) {
      const op = peekOp() as '*' | '/';
      position += 1;
      const right = parseFactor(nesting);
      left = right ? { kind: 'bin', op, left, right } : null;
    }
    return left;
  };

  const parseFactor = (nesting: number): AnswerUiExpression | null => {
    if (nesting > EXPRESSION_MAX_NESTING) return null;
    const token = tokens[position];
    if (!token) return null;
    position += 1;
    if ('num' in token)
      return Number.isFinite(token.num) ? { kind: 'num', value: token.num } : null;
    if ('ref' in token) return { kind: 'ref', id: token.ref };
    if (token.op === '-') {
      const arg = parseFactor(nesting + 1);
      return arg ? { kind: 'neg', arg } : null;
    }
    if (token.op === '(') {
      const inner = parseSum(nesting + 1);
      if (!inner || peekOp() !== ')') return null;
      position += 1;
      return inner;
    }
    return null;
  };

  const expression = parseSum(0);
  return expression && position === tokens.length ? expression : null;
}

export function answerUiExpressionRefs(expression: AnswerUiExpression): string[] {
  switch (expression.kind) {
    case 'num':
      return [];
    case 'ref':
      return [expression.id];
    case 'neg':
      return answerUiExpressionRefs(expression.arg);
    case 'bin':
      return [
        ...answerUiExpressionRefs(expression.left),
        ...answerUiExpressionRefs(expression.right),
      ];
  }
}

export function answerUiNumericValue(
  control: AnswerUiControlBlock | undefined,
  value: AnswerUiValue | undefined,
): number | null {
  if (!control) return null;
  if (control.type === 'slider') return typeof value === 'number' ? value : control.value;
  if (control.type === 'input' && control.inputType === 'number') {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (raw === '') return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (control.type === 'checklist') {
    return Array.isArray(value) ? value.length : null;
  }
  return null;
}

export function evaluateAnswerUiExpression(
  expression: AnswerUiExpression,
  resolve: (id: string) => number | null,
): number | null {
  switch (expression.kind) {
    case 'num':
      return expression.value;
    case 'ref':
      return resolve(expression.id);
    case 'neg': {
      const value = evaluateAnswerUiExpression(expression.arg, resolve);
      return value === null ? null : -value;
    }
    case 'bin': {
      const left = evaluateAnswerUiExpression(expression.left, resolve);
      const right = evaluateAnswerUiExpression(expression.right, resolve);
      if (left === null || right === null) return null;
      const result =
        expression.op === '+'
          ? left + right
          : expression.op === '-'
            ? left - right
            : expression.op === '*'
              ? left * right
              : right === 0
                ? null
                : left / right;
      return result !== null && Number.isFinite(result) ? result : null;
    }
  }
}

export const ANSWER_UI_NUMBER_LOCALE = 'en-US';
export const ANSWER_UI_UNSET_VALUE = 'not set';

export function formatAnswerUiNumber(value: number): string {
  return new Intl.NumberFormat(ANSWER_UI_NUMBER_LOCALE, { maximumFractionDigits: 2 }).format(value);
}

export function formatAnswerUiSliderValue(control: AnswerUiSliderBlock, value: number): string {
  const number = formatAnswerUiNumber(value);
  if (!control.unit) return number;
  return control.unitPosition === 'prefix'
    ? `${control.unit}${number}`
    : `${number}${/^[%°]/.test(control.unit) ? '' : ' '}${control.unit}`;
}

export function answerUiDisplayValue(
  control: AnswerUiControlBlock,
  value: AnswerUiValue | undefined,
): string {
  switch (control.type) {
    case 'slider':
      return formatAnswerUiSliderValue(control, typeof value === 'number' ? value : control.value);
    case 'input': {
      const text = typeof value === 'string' ? value.trim() : control.value;
      return text.length > 0 ? text : ANSWER_UI_UNSET_VALUE;
    }
    case 'choice': {
      const ids = Array.isArray(value) ? value : control.selected;
      const labels = control.options
        .filter((option) => ids.includes(option.id))
        .map((option) => option.label);
      return labels.length > 0 ? labels.join(', ') : 'none';
    }
    case 'checklist': {
      const ids = Array.isArray(value) ? value : [];
      return `${control.items.filter((item) => ids.includes(item.id)).length} of ${control.items.length} done`;
    }
  }
}

export type AnswerUiTemplatePart =
  | { kind: 'text'; text: string }
  | { kind: 'ref'; id: string }
  | { kind: 'expression'; source: string; expression: AnswerUiExpression | null };

const TEMPLATE_SLOT_RE = /\{\s*(=?)\s*([^{}]*?)\s*\}/g;
const TEMPLATE_REF_RE = /^[a-z][a-z0-9_]*$/i;

export function parseAnswerUiTemplate(template: string): AnswerUiTemplatePart[] {
  const parts: AnswerUiTemplatePart[] = [];
  let last = 0;
  for (const match of template.matchAll(TEMPLATE_SLOT_RE)) {
    const [whole, computed, inner = ''] = match;
    const start = match.index ?? 0;
    const isRef = computed === '' && TEMPLATE_REF_RE.test(inner);
    if (!isRef && computed !== '=') continue;
    if (start > last) parts.push({ kind: 'text', text: template.slice(last, start) });
    parts.push(
      isRef
        ? { kind: 'ref', id: inner.toLowerCase() }
        : { kind: 'expression', source: inner, expression: parseAnswerUiExpression(inner) },
    );
    last = start + whole.length;
  }
  if (last < template.length) parts.push({ kind: 'text', text: template.slice(last) });
  return parts;
}

export function answerUiTemplateRefs(template: string): string[] {
  return parseAnswerUiTemplate(template).flatMap((part) =>
    part.kind === 'ref'
      ? [part.id]
      : part.kind === 'expression' && part.expression
        ? answerUiExpressionRefs(part.expression)
        : [],
  );
}

export function answerUiTemplateIsValid(
  template: string,
  controls: ReadonlyMap<string, AnswerUiControlBlock>,
): boolean {
  return parseAnswerUiTemplate(template).every((part) => {
    if (part.kind === 'text') return true;
    if (part.kind === 'ref') return controls.has(part.id);
    return (
      part.expression !== null &&
      answerUiExpressionRefs(part.expression).every((id) => controls.has(id))
    );
  });
}

export function renderAnswerUiTemplate(
  template: string,
  controls: ReadonlyMap<string, AnswerUiControlBlock>,
  values: AnswerUiValues,
): string {
  return parseAnswerUiTemplate(template)
    .map((part) => {
      if (part.kind === 'text') return part.text;
      if (part.kind === 'ref') {
        const control = controls.get(part.id);
        return control ? answerUiDisplayValue(control, values[part.id]) : `{${part.id}}`;
      }
      if (!part.expression) return `{=${part.source}}`;
      const result = evaluateAnswerUiExpression(part.expression, (id) =>
        answerUiNumericValue(controls.get(id), values[id]),
      );
      return result === null ? ANSWER_UI_UNSET_VALUE : formatAnswerUiNumber(result);
    })
    .join('');
}

export function resolveAnswerUiNumber(
  value: AnswerUiNumberOrFormula,
  controls: ReadonlyMap<string, AnswerUiControlBlock>,
  values: AnswerUiValues,
): number | null {
  if (typeof value === 'number') return value;
  const expression = parseAnswerUiExpression(value.replace(/^\s*=/, '').trim());
  if (!expression) return null;
  return evaluateAnswerUiExpression(expression, (id) =>
    answerUiNumericValue(controls.get(id), values[id]),
  );
}

const DATE_VALUE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STEP_TOLERANCE = 1e-6;

function onStep(control: AnswerUiSliderBlock, value: number): boolean {
  const steps = (value - control.min) / control.step;
  return Math.abs(steps - Math.round(steps)) < STEP_TOLERANCE * Math.max(1, Math.abs(steps));
}

function idList(value: unknown, known: ReadonlySet<string>, max: number): string[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  if (!value.every((entry): entry is string => typeof entry === 'string' && known.has(entry))) {
    return null;
  }
  return new Set(value).size === value.length ? [...value] : null;
}

export function validateAnswerUiValue(
  control: AnswerUiControlBlock,
  value: unknown,
): AnswerUiValue | null {
  switch (control.type) {
    case 'slider':
      return typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= control.min &&
        value <= control.max &&
        onStep(control, value)
        ? value
        : null;
    case 'input': {
      if (typeof value !== 'string' || value.length > ANSWER_UI_LIMITS.inputValueLength) {
        return null;
      }
      const trimmed = value.trim();
      if (trimmed === '') return '';
      if (control.inputType === 'number') return Number.isFinite(Number(trimmed)) ? trimmed : null;
      if (control.inputType === 'date') return DATE_VALUE_RE.test(trimmed) ? trimmed : null;
      return value;
    }
    case 'choice': {
      const ids = idList(
        value,
        new Set(control.options.map((option) => option.id)),
        control.style === 'checkbox' ? control.options.length : 1,
      );
      return ids;
    }
    case 'checklist':
      return idList(value, new Set(control.items.map((item) => item.id)), control.items.length);
  }
}

export type AnswerUiValuesResult =
  { ok: true; values: Record<string, AnswerUiValue> } | { ok: false; reason: string };

export function validateAnswerUiValues(
  body: AnswerUiCardBody,
  raw: Readonly<Record<string, unknown>>,
): AnswerUiValuesResult {
  const controls = answerUiControls(body);
  for (const key of Object.keys(raw)) {
    if (!controls.has(key)) return { ok: false, reason: `unknown control ${key}` };
  }
  const values: Record<string, AnswerUiValue> = {};
  for (const [id, control] of controls) {
    if (!(id in raw)) {
      values[id] = answerUiInitialValue(control);
      continue;
    }
    const value = validateAnswerUiValue(control, raw[id]);
    if (value === null) return { ok: false, reason: `value out of range for ${id}` };
    values[id] = value;
  }
  return { ok: true, values };
}

function defaultSendTemplate(button: AnswerUiActionButton, body: AnswerUiCardBody): string {
  const lines = [...answerUiControls(body).values()].map(
    (control) =>
      `- ${control.type === 'checklist' ? (control.title ?? 'Checklist') : control.label}: {${control.id}}`,
  );
  return [button.label, ...lines].join('\n');
}

export type AnswerUiComposeResult = { ok: true; text: string } | { ok: false; reason: string };

export function composeAnswerUiMessage(
  body: AnswerUiCardBody,
  actionId: string,
  rawValues: Readonly<Record<string, unknown>>,
): AnswerUiComposeResult {
  const suggestion = answerUiSuggestions(body).find((candidate) => candidate.id === actionId);
  if (suggestion)
    return { ok: true, text: suggestion.text.slice(0, ANSWER_UI_LIMITS.messageLength) };
  const button = answerUiActionButtons(body).find((candidate) => candidate.id === actionId);
  if (!button || button.action !== 'send') return { ok: false, reason: 'unknown send action' };
  const validated = validateAnswerUiValues(body, rawValues);
  if (!validated.ok) return validated;
  const text = renderAnswerUiTemplate(
    button.template ?? defaultSendTemplate(button, body),
    answerUiControls(body),
    validated.values,
  )
    .trim()
    .slice(0, ANSWER_UI_LIMITS.messageLength);
  return text.length > 0 ? { ok: true, text } : { ok: false, reason: 'empty message' };
}

export function answerUiChecklistText(
  block: AnswerUiChecklistBlock,
  checked: readonly string[],
): string {
  const lines = block.items.map(
    (item) => `- [${checked.includes(item.id) ? 'x' : ' '}] ${item.label}`,
  );
  return (block.title ? [block.title, ...lines] : lines).join('\n');
}
