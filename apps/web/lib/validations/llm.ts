import { z } from 'zod';

/** WEB-1 (audit 2026-05-03): hard cap on a single completion's max_tokens.
 *  Without this, a single authenticated request can drain a billing
 *  period - both via inflated credit reservation and via the actual
 *  upstream LLM call (which honours whatever cap we forward). 32k is
 *  larger than any current model's per-request output ceiling that we
 *  serve through this endpoint; raise per-model in MODEL_TIER_REQUIREMENTS
 *  rather than here. */
const MAX_OUTPUT_TOKENS = 32_768;

/** Strict tool-definition schema for the OpenAI/Anthropic tool-call
 *  protocol. WEB-6 (audit 2026-05-03): the previous z.unknown() let
 *  callers forward arbitrary JSON to upstream APIs, including
 *  pathological JSON Schema (deep $ref recursion) that triggered
 *  quadratic parse times in the upstream validator. */
const ToolDefinitionSchema = z.object({
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

const ToolChoiceSchema = z.union([
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

export const LLMCompletionRequestSchema = z.object({
  model: z.string().min(1, 'Model is required'),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant', 'tool']),
        content: z.string(),
        tool_calls: z.array(z.unknown()).optional(),
        tool_call_id: z.string().optional(),
        multimodal_content: z.array(z.unknown()).optional(),
      }),
    )
    .min(1, 'At least one message is required'),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().max(MAX_OUTPUT_TOKENS).optional(),
  stream: z.boolean().optional().default(false),
  tools: z.array(ToolDefinitionSchema).max(64).optional(),
  tool_choice: ToolChoiceSchema.optional(),
  thinking_mode: z.boolean().optional(),
  usePromptCache: z.boolean().optional().default(false),
});

export type LLMCompletionRequest = z.infer<typeof LLMCompletionRequestSchema>;
