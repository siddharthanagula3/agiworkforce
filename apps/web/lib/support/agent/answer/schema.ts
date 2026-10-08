import { z } from 'zod';

export const MAX_ANSWER_WORDS = 120;

const MAX_CHARS_PER_ANSWER_WORD = 8;

export const MAX_ANSWER_CHARS = MAX_ANSWER_WORDS * MAX_CHARS_PER_ANSWER_WORD;

const CODE_FENCE = /```|~~~/;

export const modelAnswerSchema = z
  .object({
    answer: z
      .string()
      .max(MAX_ANSWER_CHARS)
      .refine((value) => !CODE_FENCE.test(value)),
    citedChunkIds: z.array(z.string().max(200)).max(12).default([]),
    abstain: z.boolean().default(false),
    abstainReason: z.string().max(200).default(''),
    proposedActionId: z.string().max(120).nullable().default(null),
  })
  .strip();

export type ModelAnswer = z.infer<typeof modelAnswerSchema>;

export function extractJsonObject(raw: string): string | null {
  const text = raw.trim();
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseModelAnswer(raw: string): ModelAnswer | null {
  const json = extractJsonObject(raw);
  if (!json) return null;
  let candidate: unknown;
  try {
    candidate = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = modelAnswerSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
