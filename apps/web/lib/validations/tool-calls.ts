import { z } from 'zod';

/**
 * Strict response-side schema for OpenAI/Anthropic tool-call protocol
 * (the `message.tool_calls[]` shape the model emits).
 *
 * WEB-13 (audit 2026-05-19): the request-side `ToolDefinitionSchema` in
 * `lib/validations/llm.ts` was hardened earlier (WEB-6) but the response
 * side remained `z.array(z.unknown())`, letting arbitrary nested payloads
 * land in the chat history. This schema enforces the documented protocol
 * shape and bounds `arguments` at 64 KiB to prevent DoS-style payload bloat.
 */
export const ToolCallResponseSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/),
  type: z.literal('function'),
  function: z.object({
    name: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/),
    /**
     * Per OpenAI/Anthropic protocol, `arguments` is the JSON-encoded string
     * of the call payload (not a parsed object). Consumers JSON.parse at the
     * point of use. 64 KiB cap matches the upstream provider behavior.
     */
    arguments: z.string().max(65_536),
  }),
});

export type ToolCallResponse = z.infer<typeof ToolCallResponseSchema>;

/**
 * Array variant with a sane upper bound on tool-call count per message.
 * Both OpenAI and Anthropic emit ≤ 10 in practice; 32 is generous.
 */
export const ToolCallResponseArraySchema = z.array(ToolCallResponseSchema).max(32);
