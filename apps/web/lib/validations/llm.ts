import { z } from 'zod';

/**
 * Hard cap on per-message content length at any LLM API gateway. Prevents
 * prompt-bomb abuse (single 10MB string drains credit reservation +
 * triggers quadratic provider parsing). 100k characters is generous
 * (≈ 25k tokens before tokenization, larger than the legal/contract
 * extracts users typically paste) but short enough to bound parse + bill
 * cost. Enforced by the OpenAI-compat `/api/llm/v1/chat/completions`
 * gateway; this constant is the single source of truth.
 * (`/api/llm/completion` was retired in restructure Wave 2 — orphaned route.)
 *
 * 2026-05-22 ultrathink audit unified two duplicate inline definitions.
 */
export const MAX_MESSAGE_LENGTH = 100_000;

/** Strict tool-definition schema for the OpenAI/Anthropic tool-call
 *  protocol. WEB-6 (audit 2026-05-03): the previous z.unknown() let
 *  callers forward arbitrary JSON to upstream APIs, including
 *  pathological JSON Schema (deep $ref recursion) that triggered
 *  quadratic parse times in the upstream validator. */
export const ToolDefinitionSchema = z.object({
  type: z.literal('function'),
  function: z.object({
    name: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/),
    description: z.string().max(1024).optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
    strict: z.boolean().optional(),
  }),
});

export const ToolChoiceSchema = z.union([
  z.enum(['auto', 'none', 'required']),
  z.object({
    type: z.literal('function'),
    function: z.object({
      name: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/),
    }),
  }),
]);
