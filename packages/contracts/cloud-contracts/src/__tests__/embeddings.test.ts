import { describe, expect, it } from 'vitest';

import {
  MAX_EMBEDDING_INPUTS,
  MAX_EMBEDDING_INPUT_CHARS,
  ManagedEmbeddingsRequestSchema,
  toEmbeddingInputs,
} from '../embeddings';

/**
 * The embeddings request contract.
 *
 * The rule it encodes: every accepted field is a field the route honours.
 * `dimensions` and `encoding_format: 'base64'` exist in OpenAI's API and are
 * REJECTED here rather than ignored — silently returning full-length float
 * vectors to a caller who asked for 256 dimensions or base64 would only surface
 * much later as degraded retrieval or a broken decoder.
 */

describe('ManagedEmbeddingsRequestSchema — accepts', () => {
  it('a single string', () => {
    const result = ManagedEmbeddingsRequestSchema.safeParse({ input: 'hello' });

    expect(result.success).toBe(true);
  });

  it('a batch', () => {
    expect(ManagedEmbeddingsRequestSchema.safeParse({ input: ['a', 'b'] }).success).toBe(true);
  });

  it('an explicit model', () => {
    const result = ManagedEmbeddingsRequestSchema.safeParse({
      input: 'hello',
      model: 'gemini-embedding-2',
    });

    expect(result.success).toBe(true);
  });

  it('encoding_format float, which is what the route returns', () => {
    const result = ManagedEmbeddingsRequestSchema.safeParse({
      input: 'hello',
      encoding_format: 'float',
    });

    expect(result.success).toBe(true);
  });
});

describe('ManagedEmbeddingsRequestSchema — rejects', () => {
  it('an empty input', () => {
    expect(ManagedEmbeddingsRequestSchema.safeParse({ input: '' }).success).toBe(false);
    expect(ManagedEmbeddingsRequestSchema.safeParse({ input: [] }).success).toBe(false);
  });

  it('a missing input', () => {
    expect(ManagedEmbeddingsRequestSchema.safeParse({}).success).toBe(false);
  });

  it('base64 encoding rather than silently returning floats', () => {
    const result = ManagedEmbeddingsRequestSchema.safeParse({
      input: 'hello',
      encoding_format: 'base64',
    });

    expect(result.success).toBe(false);
  });

  it('a dimensions parameter the route cannot honour', () => {
    // `.strict()` is what makes this fail. Accepting and ignoring it would
    // return vectors of a different length than requested.
    const result = ManagedEmbeddingsRequestSchema.safeParse({ input: 'hello', dimensions: 256 });

    expect(result.success).toBe(false);
  });

  it('a batch larger than the cap', () => {
    const oversized = Array.from({ length: MAX_EMBEDDING_INPUTS + 1 }, () => 'x');

    expect(ManagedEmbeddingsRequestSchema.safeParse({ input: oversized }).success).toBe(false);
  });

  it('an input longer than the per-item cap', () => {
    const long = 'x'.repeat(MAX_EMBEDDING_INPUT_CHARS + 1);

    expect(ManagedEmbeddingsRequestSchema.safeParse({ input: long }).success).toBe(false);
  });

  it('a non-string input', () => {
    expect(ManagedEmbeddingsRequestSchema.safeParse({ input: 42 }).success).toBe(false);
    expect(ManagedEmbeddingsRequestSchema.safeParse({ input: [1, 2] }).success).toBe(false);
  });
});

describe('toEmbeddingInputs', () => {
  it('normalizes both request shapes to an array', () => {
    // The response is always the indexed-array form, so a caller never has to
    // branch on what they sent.
    expect(toEmbeddingInputs('one')).toEqual(['one']);
    expect(toEmbeddingInputs(['one', 'two'])).toEqual(['one', 'two']);
  });
});
