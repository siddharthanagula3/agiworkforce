import { z } from 'zod';

export const MAX_MESSAGE_LENGTH = 100_000;

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
