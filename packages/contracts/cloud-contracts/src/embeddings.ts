import { z } from 'zod';

export const MAX_EMBEDDING_INPUTS = 100;
export const MAX_EMBEDDING_INPUT_CHARS = 32_000;

export const ManagedEmbeddingsRequestSchema = z
  .object({
    input: z.union([
      z.string().min(1).max(MAX_EMBEDDING_INPUT_CHARS),
      z.array(z.string().min(1).max(MAX_EMBEDDING_INPUT_CHARS)).min(1).max(MAX_EMBEDDING_INPUTS),
    ]),
    model: z.string().trim().min(1).max(200).optional(),
    encoding_format: z.literal('float').optional(),
    user: z.string().max(200).optional(),
  })
  .strict();

export type ManagedEmbeddingsRequest = z.infer<typeof ManagedEmbeddingsRequestSchema>;

export const ManagedEmbeddingsResponseSchema = z.object({
  object: z.literal('list'),
  data: z.array(
    z.object({
      object: z.literal('embedding'),
      index: z.number().int().nonnegative(),
      embedding: z.array(z.number()),
    }),
  ),
  model: z.string(),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }),
});

export type ManagedEmbeddingsResponse = z.infer<typeof ManagedEmbeddingsResponseSchema>;

export function toEmbeddingInputs(input: ManagedEmbeddingsRequest['input']): string[] {
  return Array.isArray(input) ? input : [input];
}
