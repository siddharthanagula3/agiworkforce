import { z } from 'zod';

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
    arguments: z.string().max(65_536),
  }),
});

export type ToolCallResponse = z.infer<typeof ToolCallResponseSchema>;

export const ToolCallResponseArraySchema = z.array(ToolCallResponseSchema).max(32);
