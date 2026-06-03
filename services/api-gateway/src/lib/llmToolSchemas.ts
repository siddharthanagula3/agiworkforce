import { z } from 'zod';

export const toolCallResponseSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9_-]+$/),
    type: z.literal('function'),
    function: z
      .object({
        name: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/),
        arguments: z.string().max(65_536),
      })
      .strict(),
  })
  .strict();

export const toolDefinitionSchema = z
  .object({
    type: z.literal('function'),
    function: z
      .object({
        name: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/),
        description: z.string().max(1024).optional(),
        parameters: z.record(z.string(), z.unknown()).optional(),
        strict: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

export const toolChoiceSchema = z.union([
  z.enum(['auto', 'none', 'required']),
  z
    .object({
      type: z.literal('function'),
      function: z
        .object({
          name: z
            .string()
            .min(1)
            .max(64)
            .regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/),
        })
        .strict(),
    })
    .strict(),
]);
