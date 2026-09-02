import 'server-only';

import { z } from 'zod';
import {
  INTERACTIVE_CARD_SCHEMA_VERSION,
  type ClarifyOption,
  type ClarifyQuestion,
  type InteractiveCard,
} from '@agiworkforce/types';

export const CLARIFY_TOOL_NAME = 'ask_clarifying_questions';

const MAX_QUESTIONS = 4;
const MAX_OPTIONS = 4;
const HEADER_MAX = 12;
const QUESTION_MAX = 200;
const LABEL_MAX = 60;
const DESCRIPTION_MAX = 200;

export const CLARIFY_OFFER_MAX_MESSAGE_LENGTH = 400;

const CLARIFY_OFFER_EXPLICIT_VERBS = [
  'search',
  'summarise',
  'summarize',
  'explain',
  'write',
  'draft',
  'translate',
  'list',
  'compare',
  'create',
  'generate',
  'fix',
  'review',
  'derive',
  'calculate',
  'convert',
] as const;

const CLARIFY_OFFER_OPENING_VERB_RE = new RegExp(
  `^\\s*(?:please\\s+)?(?:${CLARIFY_OFFER_EXPLICIT_VERBS.join('|')})\\b`,
  'i',
);
const CLARIFY_OFFER_URL_RE = /https?:\/\/\S+/i;
const CLARIFY_OFFER_CODE_FENCE_RE = /```/;

export interface ClarifyOfferContext {
  userMessage: string;
  hasAttachment: boolean;
  webSearch: boolean;
  research: boolean;
}

/**
 * Explicit intent and supplied material are deterministic, unlike a tool
 * description a fast model can talk itself past: a request already carrying
 * search/research, a URL, an attachment, a code fence, a long body, or an
 * opening verb like "summarize" is never missing the thing this tool exists
 * to collect, so the tool is not even offered on that turn.
 */
export function shouldOfferClarifyTool(context: ClarifyOfferContext): boolean {
  if (context.webSearch || context.research) return false;
  const trimmed = context.userMessage.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > CLARIFY_OFFER_MAX_MESSAGE_LENGTH) return false;
  if (context.hasAttachment) return false;
  if (CLARIFY_OFFER_URL_RE.test(trimmed)) return false;
  if (CLARIFY_OFFER_CODE_FENCE_RE.test(trimmed)) return false;
  if (CLARIFY_OFFER_OPENING_VERB_RE.test(trimmed)) return false;
  return true;
}

const CLARIFY_REJECTED_TOPIC_KEYWORDS = [
  'format',
  'tone',
  'length',
  'depth',
  'detail',
  'style',
  'focus',
  'angle',
  'perspective',
  'preference',
  'preferred',
] as const;

function mentionsRejectedTopic(text: string): boolean {
  const lower = text.toLowerCase();
  return CLARIFY_REJECTED_TOPIC_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function questionAsksAboutRejectedTopic(question: {
  header: string;
  question: string;
  options: { label: string; description?: string }[];
}): boolean {
  const fields = [
    question.header,
    question.question,
    ...question.options.flatMap((option) => [option.label, option.description ?? '']),
  ];
  return fields.some(mentionsRejectedTopic);
}

const OptionSchema = z
  .object({
    label: z.string().trim().min(1).max(LABEL_MAX),
    description: z.string().trim().max(DESCRIPTION_MAX).optional(),
  })
  .strict();

const QuestionSchema = z
  .object({
    header: z.string().trim().min(1).max(HEADER_MAX),
    question: z.string().trim().min(1).max(QUESTION_MAX),
    options: z.array(OptionSchema).min(2).max(MAX_OPTIONS),
    multiSelect: z.boolean().optional(),
  })
  .strict();

const ClarifyToolInputSchema = z
  .object({
    prompt: z.string().trim().max(QUESTION_MAX).optional(),
    questions: z.array(QuestionSchema).min(1).max(MAX_QUESTIONS),
  })
  .strict();

export function isClarifyTool(name: string): boolean {
  return name === CLARIFY_TOOL_NAME;
}

/**
 * The renderer, the contract and the answer path for `clarify.v1` were all
 * built; nothing ever produced one, so an ambiguous request came back as prose
 * asking the reader to describe their choice in words.
 */
export function createClarifyToolDefinition() {
  return {
    type: 'function' as const,
    function: {
      name: CLARIFY_TOOL_NAME,
      description:
        'A last resort: most requests, even open-ended ones, have a reasonable default ' +
        'reading, so answer directly rather than calling this tool. Call it only when a ' +
        'piece of information the request cannot proceed without is genuinely missing and ' +
        'cannot be inferred or defaulted, such as a bare "plan my trip" with no destination, ' +
        'dates, or budget stated anywhere, or when the user explicitly asks to be given ' +
        'choices. Renders as selectable controls, so every option must be one the user can ' +
        'pick without typing. ' +
        'Do not call it when the request already names an explicit action such as search, ' +
        'summarize, write, explain, or code, and the message already supplies what that ' +
        'action needs: do that action now, and if you had to pick among reasonable ' +
        'interpretations, state the choice in your answer instead of asking first. In ' +
        'particular, when summarizing a pasted document, produce a general summary of its ' +
        'key points; do not ask whether to format it as bullets or prose, or whether to ' +
        'focus on a general overview versus a specific angle such as risk or legal exposure, ' +
        'pick the fuller and more useful default and say so. A pasted contract or other legal ' +
        'or financial document is not special: summarize it and answer any specific part the ' +
        'user named, such as a termination or renewal clause, in that same answer, rather ' +
        'than confirming scope or depth first. When searching or researching an open-ended ' +
        'topic, cover it at a reasonable breadth; do not ask which provider, category, or ' +
        'slice to prioritize. ' +
        'Do not use it to confirm something you can reasonably assume, to ask permission, to ' +
        'offer a format, tone, or delivery preference when a sensible default exists, to break ' +
        'a task into optional next steps, or to ask a question whose options you cannot ' +
        'enumerate; answer directly instead. Reserve it for requests that truly fork into ' +
        'materially different deliverables with no reasonable default, such as a one-line ' +
        'request with no stated topic, format, or constraints at all.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            maxLength: QUESTION_MAX,
            description: 'One sentence on why the choice is needed.',
          },
          questions: {
            type: 'array',
            minItems: 1,
            maxItems: MAX_QUESTIONS,
            items: {
              type: 'object',
              properties: {
                header: {
                  type: 'string',
                  maxLength: HEADER_MAX,
                  description: 'A short label for the choice, such as Format or Scope.',
                },
                question: { type: 'string', maxLength: QUESTION_MAX },
                options: {
                  type: 'array',
                  minItems: 2,
                  maxItems: MAX_OPTIONS,
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string', maxLength: LABEL_MAX },
                      description: { type: 'string', maxLength: DESCRIPTION_MAX },
                    },
                    required: ['label'],
                    additionalProperties: false,
                  },
                },
                multiSelect: { type: 'boolean' },
              },
              required: ['header', 'question', 'options'],
              additionalProperties: false,
            },
          },
        },
        required: ['questions'],
        additionalProperties: false,
      },
    },
  };
}

export type ClarifyToolOutcome =
  | { ok: true; content: string; card: InteractiveCard }
  | { ok: false; content: string };

export function executeClarifyTool(
  args: Record<string, unknown>,
  context: { toolCallId: string; now?: () => Date },
): ClarifyToolOutcome {
  const parsed = ClarifyToolInputSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      content:
        'The clarifying questions were rejected: each needs a short header, a question, and ' +
        'between two and four selectable options. Answer the request directly instead.',
    };
  }

  if (parsed.data.questions.some(questionAsksAboutRejectedTopic)) {
    return {
      ok: false,
      content:
        'The clarifying questions were rejected: the request already specifies what it needs, ' +
        'so a question about format, tone, length, depth, focus, or a preference the user did ' +
        'not raise is not warranted here. Answer the request directly instead.',
    };
  }

  const questions: ClarifyQuestion[] = parsed.data.questions.map((question, questionIndex) => {
    // "Something else" is always offered: a fixed option list that cannot be
    // escaped is a worse question than one asked in prose.
    const options: ClarifyOption[] = question.options.map((option, optionIndex) => ({
      id: `q${questionIndex + 1}o${optionIndex + 1}`,
      label: option.label,
      description: option.description ?? '',
    }));
    return {
      id: `q${questionIndex + 1}`,
      header: question.header,
      question: question.question,
      options,
      multiSelect: question.multiSelect === true,
      isOther: true,
      isSecret: false,
    };
  });

  const createdAt = (context.now?.() ?? new Date()).toISOString();
  const headline =
    parsed.data.prompt ??
    (questions.length === 1 ? questions[0]!.question : 'A few details before I continue');

  return {
    ok: true,
    content:
      'The clarifying questions are now on screen as selectable options. Wait for the ' +
      'answers; do not guess them or repeat the questions as text.',
    card: {
      schemaVersion: INTERACTIVE_CARD_SCHEMA_VERSION,
      cardId: `clarify-${context.toolCallId}`,
      kind: 'clarify.v1',
      recognized: true,
      createdAt,
      fallback: {
        headline,
        text: questions
          .map((q) => `${q.question} (${q.options.map((o) => o.label).join(' / ')})`)
          .join('\n'),
      },
      producedBy: { toolCallId: context.toolCallId, toolName: CLARIFY_TOOL_NAME },
      body: {
        ...(parsed.data.prompt ? { prompt: parsed.data.prompt } : {}),
        questions,
        state: { status: 'pending' },
      },
    },
  };
}
