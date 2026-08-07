import { z } from 'zod';

/**
 * Managed Cloud embeddings contract.
 *
 * Shaped after the OpenAI `/v1/embeddings` request and response so an existing
 * client library can point at this gateway without a bespoke adapter. Where the
 * shapes differ, this one is NARROWER, never wider — a field accepted here is a
 * field the route honours.
 *
 * Notably absent, and deliberately so:
 *   - `dimensions` — the catalog's embedding model has a fixed output size, and
 *     accepting a truncation parameter the route ignores would return vectors of
 *     a different length than the caller asked for. Silently wrong vectors are
 *     far worse than an unsupported parameter, because they only surface as
 *     degraded retrieval quality much later.
 *   - `encoding_format: 'base64'` — supported by OpenAI, but returning float
 *     arrays when base64 was requested would break the caller's decoder.
 */

/** Upper bounds sized so one request cannot monopolise a provider quota. */
export const MAX_EMBEDDING_INPUTS = 100;
export const MAX_EMBEDDING_INPUT_CHARS = 32_000;

export const ManagedEmbeddingsRequestSchema = z
  .object({
    /**
     * A single string or a batch. Matches OpenAI, which accepts both; the
     * response always uses the indexed-array form so a caller does not have to
     * branch on what they sent.
     */
    input: z.union([
      z.string().min(1).max(MAX_EMBEDDING_INPUT_CHARS),
      z.array(z.string().min(1).max(MAX_EMBEDDING_INPUT_CHARS)).min(1).max(MAX_EMBEDDING_INPUTS),
    ]),
    /** Catalog model id. Omitted means the default embedding model. */
    model: z.string().trim().min(1).max(200).optional(),
    /**
     * Only `float` is accepted. `base64` is rejected rather than ignored: a
     * caller that asked for base64 and received floats would fail in their
     * decoder with no indication the gateway substituted a format.
     */
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
      /** Position in the input batch, so results can be re-associated. */
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

/** Normalize the union input to the array form the route works with. */
export function toEmbeddingInputs(input: ManagedEmbeddingsRequest['input']): string[] {
  return Array.isArray(input) ? input : [input];
}
