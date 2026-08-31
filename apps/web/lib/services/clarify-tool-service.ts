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
        'Ask the user to choose between concrete options when their request is genuinely ' +
        'ambiguous and the answer changes materially depending on the choice. Renders as ' +
        'selectable controls, so every option must be one the user can pick without typing. ' +
        'Do not use it to confirm something you can reasonably assume, to ask permission, or ' +
        'to ask a question whose options you cannot enumerate — answer directly instead.',
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
