import { z } from 'zod';

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
  max_tokens: z.number().int().positive().optional(),
  stream: z.boolean().optional().default(false),
  tools: z.array(z.unknown()).optional(),
  tool_choice: z.unknown().optional(),
  thinking_mode: z.boolean().optional(),
});

export type LLMCompletionRequest = z.infer<typeof LLMCompletionRequestSchema>;
