import type { RoutingTaskType } from '@agiworkforce/types';

export const ANSWER_DEPTHS = [
  'one_word',
  'one_sentence',
  'very_short',
  'short',
  'normal',
  'detailed',
  'comprehensive',
] as const;

export type AnswerDepth = (typeof ANSWER_DEPTHS)[number];

export const ANSWER_FORMATS = [
  'word',
  'sentence',
  'plain_text',
  'bullets',
  'steps',
  'table',
  'code',
  'json',
  'markdown_document',
  'mixed',
] as const;

export type AnswerFormat = (typeof ANSWER_FORMATS)[number];

export type ClarificationRequirement = 'required' | 'not_required' | 'uncertain';

export interface SemanticResponseAssessment {
  accepted: boolean;
  answerDepth: AnswerDepth;
  answerFormat: AnswerFormat;
  explanationRequired: boolean;
  clarification: ClarificationRequirement;
}

export interface ResponseBudgetInput {
  message: string;
  taskType: RoutingTaskType;
  apiResponseFormat?: 'json_object' | null;
  requestedMaxOutputTokens?: number;
  modelMaxOutputTokens?: number;
  semanticAssessment?: SemanticResponseAssessment | null;
}

export type ResponseBudgetSource = 'explicit' | 'semantic' | 'deterministic' | 'default';

export interface ResponseBudgetPlan {
  depth: AnswerDepth;
  format: AnswerFormat;
  outputTokenBudget: number;
  explanationRequired: boolean;
  clarification: ClarificationRequirement;
  source: ResponseBudgetSource;
  instruction: string;
}

export const RESPONSE_OUTPUT_TOKEN_CEILINGS: Readonly<Record<AnswerDepth, number>> = {
  one_word: 32,
  one_sentence: 128,
  very_short: 256,
  short: 768,
  normal: 2_048,
  detailed: 4_096,
  comprehensive: 8_192,
};

const ONE_WORD_PATTERNS = [/\bone word\b/iu, /\byes\s*(?:\/|or)\s*no\b/iu];
const ONE_SENTENCE_PATTERNS = [/\b(?:one|a single) sentence\b/iu];
const VERY_SHORT_PATTERNS = [
  /\b(?:just|only) (?:give me |tell me )?(?:the )?answer\b/iu,
  /\b(?:do not|don't) explain\b/iu,
  /\bquick answer\b/iu,
  /\btoo (?:long|much detail)\b/iu,
  /\bmake (?:it|that) shorter\b/iu,
  /\btl;?dr\b/iu,
  /\b(?:answer|reply|respond) briefly\b/iu,
  /\bkeep (?:it|the answer) (?:very )?(?:short|brief)\b/iu,
];
const COMPREHENSIVE_PATTERNS = [
  /\bcomprehensive\b/iu,
  /\bexhaustive\b/iu,
  /\bgive me everything\b/iu,
  /\bfull analysis\b/iu,
  /\bcomplete checklist\b/iu,
];
const DETAILED_PATTERNS = [
  /\bexplain\b/iu,
  /\bwhy\b/iu,
  /\b(?:detail|detailed)\b/iu,
  /\bdeep dive\b/iu,
  /\bgo deeper\b/iu,
  /\bwalk me through\b/iu,
  /\bshow (?:the|your) (?:work|reasoning)\b/iu,
  /\bstep by step\b/iu,
  /\bfull reasoning\b/iu,
];

const JSON_FORMAT_PATTERNS = [
  /\b(?:as|in|return|output|provide|give me) json\b/iu,
  /\bjson only\b/iu,
];
const TABLE_FORMAT_PATTERNS = [/\b(?:as|in) (?:a )?table\b/iu, /\btable format\b/iu];
const BULLET_FORMAT_PATTERNS = [/\b(?:as|in) bullet(?:s| points)?\b/iu, /\bbullet list\b/iu];
const STEP_FORMAT_PATTERNS = [/\bstep by step\b/iu, /\bnumbered steps\b/iu];
const CODE_FORMAT_PATTERNS = [/\bcode only\b/iu, /\b(?:return|output|give me) (?:the )?code\b/iu];
const MARKDOWN_DOCUMENT_PATTERNS = [/\bmarkdown document\b/iu, /\bmarkdown file\b/iu];
const PLAIN_TEXT_PATTERNS = [/\bplain text\b/iu];

const DIRECT_QUESTION = /^(?:is|are|was|were|do|does|did|has|have|had|can|could|will|would)\b/iu;
const DIRECT_VALUE_QUESTION = /^(?:what|which) (?:model|plan|version|status|state|environment)\b/iu;
const DIRECT_COUNT_QUESTION = /^how (?:many|much)\b/iu;

function matchesAny(message: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(message));
}

function explicitDepth(message: string): AnswerDepth | null {
  if (matchesAny(message, ONE_WORD_PATTERNS)) return 'one_word';
  if (matchesAny(message, ONE_SENTENCE_PATTERNS)) return 'one_sentence';
  if (matchesAny(message, VERY_SHORT_PATTERNS)) return 'very_short';
  if (matchesAny(message, COMPREHENSIVE_PATTERNS)) return 'comprehensive';
  if (matchesAny(message, DETAILED_PATTERNS)) return 'detailed';
  return null;
}

function explicitFormat(
  message: string,
  depth: AnswerDepth | null,
  apiResponseFormat: ResponseBudgetInput['apiResponseFormat'],
): AnswerFormat | null {
  if (apiResponseFormat === 'json_object' || matchesAny(message, JSON_FORMAT_PATTERNS)) {
    return 'json';
  }
  if (matchesAny(message, TABLE_FORMAT_PATTERNS)) return 'table';
  if (matchesAny(message, BULLET_FORMAT_PATTERNS)) return 'bullets';
  if (matchesAny(message, STEP_FORMAT_PATTERNS)) return 'steps';
  if (matchesAny(message, CODE_FORMAT_PATTERNS)) return 'code';
  if (matchesAny(message, MARKDOWN_DOCUMENT_PATTERNS)) return 'markdown_document';
  if (matchesAny(message, PLAIN_TEXT_PATTERNS)) return 'plain_text';
  if (depth === 'one_word') return 'word';
  if (depth === 'one_sentence') return 'sentence';
  return null;
}

function deterministicDepth(message: string, taskType: RoutingTaskType): AnswerDepth | null {
  const trimmed = message.trim();
  if (taskType === 'simple_chat') {
    if (
      trimmed.length <= 160 &&
      (DIRECT_QUESTION.test(trimmed) ||
        DIRECT_VALUE_QUESTION.test(trimmed) ||
        DIRECT_COUNT_QUESTION.test(trimmed))
    ) {
      return 'one_sentence';
    }
    return 'very_short';
  }
  if (taskType === 'research' && trimmed.length <= 160) return 'short';
  return null;
}

function defaultFormat(depth: AnswerDepth): AnswerFormat {
  if (depth === 'one_word') return 'word';
  if (depth === 'one_sentence') return 'sentence';
  if (depth === 'very_short') return 'plain_text';
  return 'mixed';
}

function positiveInteger(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function outputTokenBudget(
  depth: AnswerDepth,
  requestedMaxOutputTokens: number | undefined,
  modelMaxOutputTokens: number | undefined,
): number {
  const limits = [
    RESPONSE_OUTPUT_TOKEN_CEILINGS[depth],
    positiveInteger(requestedMaxOutputTokens),
    positiveInteger(modelMaxOutputTokens),
  ].filter((value): value is number => value !== null);
  return Math.max(1, Math.min(...limits));
}

function formatInstruction(format: AnswerFormat): string {
  switch (format) {
    case 'word':
      return 'Return one word, value, or status.';
    case 'sentence':
      return 'Use one concise sentence.';
    case 'plain_text':
      return 'Use concise plain text.';
    case 'bullets':
      return 'Use compact bullets.';
    case 'steps':
      return 'Use concise numbered steps.';
    case 'table':
      return 'Use a compact table.';
    case 'code':
      return 'Return only the requested code.';
    case 'json':
      return 'Return valid JSON without a Markdown fence.';
    case 'markdown_document':
      return 'Return a complete Markdown document.';
    case 'mixed':
      return '';
  }
}

function depthInstruction(depth: AnswerDepth): string {
  switch (depth) {
    case 'one_word':
      return 'Give only the direct answer.';
    case 'one_sentence':
      return 'Include the answer and only an essential qualification.';
    case 'very_short':
      return 'Use at most three concise sentences.';
    case 'short':
      return 'Use a few concise paragraphs or compact bullets.';
    case 'normal':
      return 'Give the explanation needed to satisfy the request without extra background.';
    case 'detailed':
      return 'Give the requested explanation, comparison, reasoning, or implementation detail.';
    case 'comprehensive':
      return 'Cover the requested scope comprehensively without repetition.';
  }
}

function buildInstruction(input: {
  depth: AnswerDepth;
  format: AnswerFormat;
  explanationRequired: boolean;
  clarification: ClarificationRequirement;
}): string {
  if (input.clarification === 'required') {
    return 'Ask one concise clarification question. Do not speculate or add background.';
  }
  const parts = [formatInstruction(input.format), depthInstruction(input.depth)].filter(Boolean);
  parts.push(
    input.explanationRequired
      ? 'Include the requested reasoning.'
      : 'Do not add examples, alternatives, headings, a recap, or an offer to continue unless needed for correctness.',
  );
  if (input.clarification === 'uncertain') {
    parts.push(
      'Ask one concise question only if different interpretations would materially change correctness or a consequential action.',
    );
  }
  return parts.join(' ');
}

export function planResponseBudget(input: ResponseBudgetInput): ResponseBudgetPlan {
  const requestedDepth = explicitDepth(input.message);
  const requestedFormat = explicitFormat(input.message, requestedDepth, input.apiResponseFormat);
  const acceptedAssessment = input.semanticAssessment?.accepted ? input.semanticAssessment : null;
  const inferredDepth = deterministicDepth(input.message, input.taskType);

  let depth =
    requestedDepth ?? acceptedAssessment?.answerDepth ?? inferredDepth ?? ('normal' as const);
  const format = requestedFormat ?? acceptedAssessment?.answerFormat ?? defaultFormat(depth);
  const explanationRequired =
    requestedDepth === 'detailed' ||
    requestedDepth === 'comprehensive' ||
    (requestedDepth === null && (acceptedAssessment?.explanationRequired ?? false));
  const clarification = acceptedAssessment?.clarification ?? 'not_required';
  if (clarification === 'required') depth = 'very_short';

  const source: ResponseBudgetSource =
    requestedDepth !== null || requestedFormat !== null
      ? 'explicit'
      : acceptedAssessment !== null
        ? 'semantic'
        : inferredDepth !== null
          ? 'deterministic'
          : 'default';

  return {
    depth,
    format,
    outputTokenBudget: outputTokenBudget(
      depth,
      input.requestedMaxOutputTokens,
      input.modelMaxOutputTokens,
    ),
    explanationRequired,
    clarification,
    source,
    instruction: buildInstruction({ depth, format, explanationRequired, clarification }),
  };
}
