import { z } from 'zod';
import {
  ANSWER_UI_ACTION_KINDS,
  ANSWER_UI_CALLOUT_TONES,
  ANSWER_UI_CHART_TYPES,
  ANSWER_UI_CHOICE_STYLES,
  ANSWER_UI_COLUMNS_MAX,
  ANSWER_UI_COLUMNS_MIN,
  ANSWER_UI_INPUT_TYPES,
  ANSWER_UI_LIMITS,
  ANSWER_UI_STATUS_TONES,
  answerUiControls,
  answerUiSendTargetIds,
  answerUiExpressionRefs,
  answerUiTemplateIsValid,
  isAnswerUiContainer,
  parseAnswerUiExpression,
  validateAnswerUiValue,
  walkAnswerUiBlocks,
  type AnswerUiBlock,
  type AnswerUiCardBody,
} from '@agiworkforce/types';
import { isAllowedMapSearchProviderUrl } from './map-urls';

export const ANSWER_UI_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

const LESS_THAN = 60;
const GREATER_THAN = 62;
const SLASH = 47;
const HYPHEN = 45;
const WHITESPACE = /\s/;

function isAsciiLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isTagNameCode(code: number): boolean {
  return isAsciiLetter(code) || (code >= 48 && code <= 57) || code === HYPHEN;
}

function htmlTagEnd(value: string, start: number): number {
  let index = start + 1;
  if (value.charCodeAt(index) === SLASH) index += 1;
  if (!isAsciiLetter(value.charCodeAt(index))) return -1;
  index += 1;
  while (isTagNameCode(value.charCodeAt(index))) index += 1;
  const next = value.charCodeAt(index);
  if (next === GREATER_THAN) return index + 1;
  if (next === SLASH) return value.charCodeAt(index + 1) === GREATER_THAN ? index + 2 : -1;
  if (!WHITESPACE.test(value.charAt(index))) return -1;
  index += 1;
  while (index < value.length) {
    const code = value.charCodeAt(index);
    if (code === LESS_THAN) return -1;
    if (code === GREATER_THAN) return index + 1;
    index += 1;
  }
  return -1;
}

function* answerUiHtmlRanges(value: string): Generator<readonly [number, number]> {
  let commentsClose = true;
  let index = value.indexOf('<');
  while (index !== -1) {
    let end = htmlTagEnd(value, index);
    if (end === -1 && commentsClose && value.startsWith('<!--', index)) {
      const close = value.indexOf('-->', index + 4);
      if (close === -1) commentsClose = false;
      else end = close + 3;
    }
    if (end === -1) {
      index = value.indexOf('<', index + 1);
    } else {
      yield [index, end];
      index = value.indexOf('<', end);
    }
  }
}

export function containsAnswerUiHtml(value: string): boolean {
  return !answerUiHtmlRanges(value).next().done;
}

export function removeAnswerUiHtml(value: string): string {
  let kept = '';
  let last = 0;
  for (const [start, end] of answerUiHtmlRanges(value)) {
    kept += value.slice(last, start);
    last = end;
  }
  return last === 0 ? value : kept + value.slice(last);
}

function safeText(max: number) {
  return z
    .string()
    .max(max)
    .refine((value) => !containsAnswerUiHtml(value), { message: 'html is not allowed' });
}

const Id = z.string().min(1).max(ANSWER_UI_LIMITS.idLength).regex(ANSWER_UI_ID_PATTERN);
const Label = safeText(ANSWER_UI_LIMITS.labelLength).pipe(z.string().min(1));
const Title = safeText(ANSWER_UI_LIMITS.titleLength).pipe(z.string().min(1));
const Markdown = safeText(ANSWER_UI_LIMITS.textLength).pipe(z.string().min(1));
const Template = safeText(ANSWER_UI_LIMITS.templateLength).pipe(z.string().min(1));

export function isAnswerUiHttpsUrl(value: string): boolean {
  if (value.length > ANSWER_UI_LIMITS.urlLength) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

const HttpsUrl = z.string().refine(isAnswerUiHttpsUrl, { message: 'https only' });
const FiniteNumber = z.number().finite();
const NumberOrFormula = z.union([
  FiniteNumber,
  z
    .string()
    .max(ANSWER_UI_LIMITS.expressionLength + 1)
    .refine((value) => parseAnswerUiExpression(value.replace(/^\s*=/, '').trim()) !== null, {
      message: 'not a formula',
    }),
]);

const HeadingSchema = z
  .object({
    type: z.literal('heading'),
    id: Id,
    text: Title,
    level: z.union([z.literal(2), z.literal(3)]),
  })
  .strict();

const TextSchema = z.object({ type: z.literal('text'), id: Id, markdown: Markdown }).strict();

const CalloutSchema = z
  .object({
    type: z.literal('callout'),
    id: Id,
    tone: z.enum(ANSWER_UI_CALLOUT_TONES),
    title: Title.optional(),
    markdown: Markdown,
  })
  .strict();

const TableSchema = z
  .object({
    type: z.literal('table'),
    id: Id,
    caption: Title.optional(),
    columns: z.array(Label).min(1).max(ANSWER_UI_LIMITS.tableColumns),
    rows: z
      .array(z.array(safeText(ANSWER_UI_LIMITS.cellLength)).max(ANSWER_UI_LIMITS.tableColumns))
      .min(1)
      .max(ANSWER_UI_LIMITS.tableRows),
  })
  .strict()
  .refine((table) => table.rows.every((row) => row.length === table.columns.length), {
    message: 'every row needs one cell per column',
  });

const ChartSchema = z
  .object({
    type: z.literal('chart'),
    id: Id,
    title: Title,
    chart: z.enum(ANSWER_UI_CHART_TYPES),
    xLabel: Label.optional(),
    yLabel: Label.optional(),
    series: z
      .array(
        z
          .object({
            name: Label,
            points: z
              .array(
                z
                  .object({
                    x: z.union([safeText(ANSWER_UI_LIMITS.labelLength), FiniteNumber]),
                    y: NumberOrFormula,
                  })
                  .strict(),
              )
              .min(1)
              .max(ANSWER_UI_LIMITS.chartPoints),
          })
          .strict(),
      )
      .min(1)
      .max(ANSWER_UI_LIMITS.chartSeries),
  })
  .strict()
  .refine(
    (chart) =>
      chart.chart !== 'scatter' ||
      chart.series.every((series) => series.points.every((point) => typeof point.x === 'number')),
    { message: 'scatter points need numeric x' },
  );

const ChecklistSchema = z
  .object({
    type: z.literal('checklist'),
    id: Id,
    title: Title.optional(),
    items: z
      .array(z.object({ id: Id, label: Label, checked: z.boolean() }).strict())
      .min(1)
      .max(ANSWER_UI_LIMITS.checklistItems),
  })
  .strict();

const ChoiceSchema = z
  .object({
    type: z.literal('choice'),
    id: Id,
    label: Label,
    style: z.enum(ANSWER_UI_CHOICE_STYLES),
    options: z
      .array(z.object({ id: Id, label: Label, description: Label.optional() }).strict())
      .min(2)
      .max(ANSWER_UI_LIMITS.choiceOptions),
    selected: z.array(Id).max(ANSWER_UI_LIMITS.choiceOptions),
    readout: Template.optional(),
  })
  .strict();

const SliderSchema = z
  .object({
    type: z.literal('slider'),
    id: Id,
    label: Label,
    min: FiniteNumber,
    max: FiniteNumber,
    step: FiniteNumber.positive(),
    value: FiniteNumber,
    unit: safeText(12).pipe(z.string().min(1)).optional(),
    unitPosition: z.enum(['prefix', 'suffix']).optional(),
    readout: Template.optional(),
  })
  .strict()
  .refine(
    (slider) => slider.min < slider.max && (slider.max - slider.min) / slider.step <= 10_000,
    {
      message: 'slider range is invalid',
    },
  );

const InputSchema = z
  .object({
    type: z.literal('input'),
    id: Id,
    label: Label,
    inputType: z.enum(ANSWER_UI_INPUT_TYPES),
    placeholder: Label.optional(),
    value: safeText(ANSWER_UI_LIMITS.inputValueLength),
    readout: Template.optional(),
  })
  .strict();

const ReadoutSchema = z
  .object({ type: z.literal('readout'), id: Id, label: Label, value: Template })
  .strict();

const GallerySchema = z
  .object({
    type: z.literal('gallery'),
    id: Id,
    images: z
      .array(
        z
          .object({
            url: HttpsUrl,
            alt: Label,
            caption: Label.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(ANSWER_UI_LIMITS.galleryImages),
  })
  .strict();

const MapSchema = z
  .object({
    type: z.literal('map'),
    id: Id,
    title: Title,
    pins: z
      .array(
        z
          .object({
            id: Id,
            label: Label,
            latitude: z.number().finite().min(-85.05112878).max(85.05112878),
            longitude: z.number().finite().min(-180).max(180),
            note: Label.optional(),
            url: z.string().refine((value) => isAllowedMapSearchProviderUrl(value, 'google_maps'), {
              message: 'pin link is not a map search',
            }),
          })
          .strict(),
      )
      .min(1)
      .max(ANSWER_UI_LIMITS.mapPins),
  })
  .strict();

const ActionsSchema = z
  .object({
    type: z.literal('actions'),
    id: Id,
    buttons: z
      .array(
        z
          .object({
            id: Id,
            label: Label,
            action: z.enum(ANSWER_UI_ACTION_KINDS),
            template: Template.optional(),
            url: HttpsUrl.optional(),
            primary: z.boolean(),
          })
          .strict()
          .refine((button) => (button.action === 'link') === Boolean(button.url), {
            message: 'a link button needs a url and only a link button may have one',
          })
          .refine((button) => button.action !== 'copy' || Boolean(button.template), {
            message: 'a copy button needs the text to copy',
          }),
      )
      .min(1)
      .max(ANSWER_UI_LIMITS.actionsPerBlock),
  })
  .strict();

const Tone = z.enum(ANSWER_UI_STATUS_TONES);
const Badge = safeText(40).pipe(z.string().min(1));

const StatusSchema = z
  .object({
    type: z.literal('status'),
    id: Id,
    title: Title.optional(),
    items: z
      .array(
        z
          .object({ id: Id, label: Label, status: Badge, tone: Tone, note: Label.optional() })
          .strict(),
      )
      .min(1)
      .max(ANSWER_UI_LIMITS.listItems),
  })
  .strict();

const StepsSchema = z
  .object({
    type: z.literal('steps'),
    id: Id,
    title: Title.optional(),
    items: z
      .array(
        z
          .object({
            id: Id,
            title: Label,
            text: safeText(ANSWER_UI_LIMITS.textLength).pipe(z.string().min(1)).optional(),
            status: Badge.optional(),
            tone: Tone.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(ANSWER_UI_LIMITS.listItems),
  })
  .strict();

const KeyValueSchema = z
  .object({
    type: z.literal('keyvalue'),
    id: Id,
    title: Title.optional(),
    items: z
      .array(z.object({ label: Label, value: safeText(ANSWER_UI_LIMITS.cellLength) }).strict())
      .min(1)
      .max(ANSWER_UI_LIMITS.listItems),
  })
  .strict();

const CopySchema = z
  .object({
    type: z.literal('copy'),
    id: Id,
    title: Title.optional(),
    badge: Badge.optional(),
    text: safeText(ANSWER_UI_LIMITS.copyTextLength).pipe(z.string().min(1)),
    buttonLabel: Label,
  })
  .strict();

const SuggestionsSchema = z
  .object({
    type: z.literal('suggestions'),
    id: Id,
    items: z
      .array(z.object({ id: Id, text: Label }).strict())
      .min(1)
      .max(ANSWER_UI_LIMITS.suggestions),
  })
  .strict();

const FilesSchema = z
  .object({
    type: z.literal('files'),
    id: Id,
    title: Title.optional(),
    items: z
      .array(
        z
          .object({
            id: Id,
            name: Label,
            fileType: Badge,
            description: Label.optional(),
            url: HttpsUrl.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(ANSWER_UI_LIMITS.listItems),
  })
  .strict();

const TranscriptSchema = z
  .object({
    type: z.literal('transcript'),
    id: Id,
    title: Title.optional(),
    items: z
      .array(
        z
          .object({
            time: safeText(16).pipe(z.string().min(1)).optional(),
            speaker: safeText(60).pipe(z.string().min(1)).optional(),
            text: safeText(ANSWER_UI_LIMITS.textLength).pipe(z.string().min(1)),
          })
          .strict(),
      )
      .min(1)
      .max(ANSWER_UI_LIMITS.tableRows),
  })
  .strict();

const BlockSchema: z.ZodType<AnswerUiBlock> = z.lazy(() =>
  z.union([
    HeadingSchema,
    TextSchema,
    CalloutSchema,
    TableSchema,
    ChartSchema,
    ChecklistSchema,
    ChoiceSchema,
    SliderSchema,
    InputSchema,
    ReadoutSchema,
    GallerySchema,
    MapSchema,
    ActionsSchema,
    StatusSchema,
    StepsSchema,
    KeyValueSchema,
    CopySchema,
    SuggestionsSchema,
    FilesSchema,
    TranscriptSchema,
    z
      .object({
        type: z.literal('card'),
        id: Id,
        title: Title.optional(),
        subtitle: Label.optional(),
        badge: Badge.optional(),
        badgeTone: Tone.optional(),
        blocks: z.array(BlockSchema).max(ANSWER_UI_LIMITS.maxNodes),
      })
      .strict(),
    z
      .object({
        type: z.literal('columns'),
        id: Id,
        blocks: z.array(BlockSchema).min(ANSWER_UI_COLUMNS_MIN).max(ANSWER_UI_COLUMNS_MAX),
      })
      .strict(),
    z
      .object({
        type: z.literal('disclosure'),
        id: Id,
        summary: Label,
        open: z.boolean(),
        blocks: z.array(BlockSchema).min(1).max(ANSWER_UI_LIMITS.maxNodes),
      })
      .strict(),
  ]),
) as z.ZodType<AnswerUiBlock>;

type IssueAt = (top: number, message: string) => void;

function issueAt(ctx: z.RefinementCtx): IssueAt {
  return (top, message) => ctx.addIssue({ code: 'custom', path: ['blocks', top], message });
}

function checkStructure(body: AnswerUiCardBody, issue: IssueAt): void {
  const ids = new Set<string>();
  let nodes = 0;
  body.blocks.forEach((top, index) =>
    walkAnswerUiBlocks([top], (block, depth) => {
      nodes += 1;
      if (nodes > ANSWER_UI_LIMITS.maxNodes) issue(index, 'too many blocks');
      if (
        depth >= ANSWER_UI_LIMITS.maxDepth ||
        (isAnswerUiContainer(block) &&
          depth + 1 >= ANSWER_UI_LIMITS.maxDepth &&
          block.blocks.length > 0)
      ) {
        issue(index, `nested too deep at ${block.id}`);
      }
      if (ids.has(block.id)) issue(index, `duplicate id ${block.id}`);
      ids.add(block.id);
      const inner =
        block.type === 'checklist'
          ? block.items.map((item) => item.id)
          : block.type === 'choice'
            ? block.options.map((option) => option.id)
            : block.type === 'map'
              ? block.pins.map((pin) => pin.id)
              : block.type === 'status' || block.type === 'steps' || block.type === 'files'
                ? block.items.map((item) => item.id)
                : [];
      if (new Set(inner).size !== inner.length) issue(index, `duplicate item id in ${block.id}`);
    }),
  );
}

function checkSendTargets(body: AnswerUiCardBody, issue: IssueAt): void {
  const blockIds = new Set<string>();
  walkAnswerUiBlocks(body.blocks, (block) => blockIds.add(block.id));
  const seen = new Set<string>();
  body.blocks.forEach((top, index) => {
    for (const id of answerUiSendTargetIds({ blocks: [top] })) {
      if (seen.has(id) || blockIds.has(id)) issue(index, `send target ${id} is not unique`);
      seen.add(id);
    }
  });
}

function checkBindings(body: AnswerUiCardBody, issue: IssueAt): void {
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
  body.blocks.forEach((top, index) => {
    const template = (value: string | undefined, where: string) => {
      if (value !== undefined && !answerUiTemplateIsValid(value, controls)) {
        issue(index, `unbound template in ${where}`);
      }
    };
    walkAnswerUiBlocks([top], (block) => {
      if (
        (block.type === 'choice' && validateAnswerUiValue(block, block.selected) === null) ||
        ((block.type === 'slider' || block.type === 'input') &&
          validateAnswerUiValue(block, block.value) === null)
      ) {
        issue(index, `bad initial value in ${block.id}`);
      }
      if (block.type === 'choice' || block.type === 'slider' || block.type === 'input') {
        template(block.readout, block.id);
      }
      if (block.type === 'readout') template(block.value, block.id);
      if (block.type === 'actions') {
        for (const button of block.buttons) template(button.template, button.id);
      }
      if (block.type !== 'chart') return;
      for (const series of block.series) {
        for (const point of series.points) {
          if (typeof point.y !== 'string') continue;
          const expression = parseAnswerUiExpression(point.y.replace(/^\s*=/, '').trim());
          if (!expression || !answerUiExpressionRefs(expression).every((id) => numeric.has(id))) {
            issue(index, `chart ${block.id} has a formula over an unknown number`);
          }
        }
      }
    });
  });
}

export const AnswerUiCardBodySchema = z
  .object({
    title: Title.optional(),
    blocks: z.array(BlockSchema).min(1).max(ANSWER_UI_LIMITS.maxNodes),
  })
  .strict()
  .superRefine((body, ctx) => {
    const issue = issueAt(ctx);
    checkStructure(body, issue);
    checkSendTargets(body, issue);
    checkBindings(body, issue);
  });
