import { z } from 'zod';
import { MANAGED_CLOUD_CHAT_MAX_LATEST_MESSAGE_LENGTH } from '@agiworkforce/cloud-contracts';

export const MAX_MESSAGE_LENGTH = MANAGED_CLOUD_CHAT_MAX_LATEST_MESSAGE_LENGTH;

/** A request with no saved conversation has nothing to compact against, so its whole text stays bounded. */
export const MAX_STATELESS_TOTAL_LENGTH = 1_000_000;

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
