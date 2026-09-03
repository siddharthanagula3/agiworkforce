import { describe, expect, it } from 'vitest';

import {
  MAX_EMBEDDING_INPUTS,
  MAX_EMBEDDING_INPUT_CHARS,
  ManagedEmbeddingsRequestSchema,
  toEmbeddingInputs,
} from '../embeddings';

const FIXTURE_MODEL_ID = 'fixture-embedding-model';

describe('ManagedEmbeddingsRequestSchema, accepts', () => {
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
      model: FIXTURE_MODEL_ID,
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

describe('ManagedEmbeddingsRequestSchema, rejects', () => {
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
    expect(toEmbeddingInputs('one')).toEqual(['one']);
    expect(toEmbeddingInputs(['one', 'two'])).toEqual(['one', 'two']);
  });
});
