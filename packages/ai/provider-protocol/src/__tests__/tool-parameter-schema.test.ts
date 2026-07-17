/**
 * Golden tests for tool-parameter-schema normalization.
 *
 * Cross-provider contract: every adapter feeds tool input schemas through
 * `normalizeToolParameterSchema` so:
 *   - OpenAI gets a top-level `type: object` (rejecting bare `anyOf` unions)
 *   - Gemini gets validation keywords stripped
 *   - xAI / opt-in callers can supply an unsupportedKeywords set
 *
 * These tests pin the inputs => outputs that are exercised at adapter
 * request build time. A regression here means cross-provider tool-call
 * handoff breaks (differentiator #3 — Claude->GPT->Llama in one thread).
 */

import { describe, expect, it } from 'vitest';

import { normalizeToolParameterSchema } from '../tool-parameter-schema';

describe('normalizeToolParameterSchema — passthrough cases', () => {
  it('returns a top-level object schema unchanged for a generic provider', () => {
    const schema = {
      type: 'object',
      properties: { foo: { type: 'string' } },
      required: ['foo'],
    };
    expect(normalizeToolParameterSchema(schema)).toEqual(schema);
  });

  it('returns the input as-is when not a record (string, number, null)', () => {
    expect(normalizeToolParameterSchema('not a schema')).toBe('not a schema');
    expect(normalizeToolParameterSchema(null)).toBe(null);
    expect(normalizeToolParameterSchema(42)).toBe(42);
  });

  it('coerces an empty schema to {type:object, properties:{}}', () => {
    expect(normalizeToolParameterSchema({})).toEqual({
      type: 'object',
      properties: {},
    });
  });

  it('adds the missing top-level type:object when properties exist', () => {
    expect(
      normalizeToolParameterSchema({
        properties: { x: { type: 'number' } },
        required: ['x'],
      }),
    ).toEqual({
      type: 'object',
      properties: { x: { type: 'number' } },
      required: ['x'],
    });
  });

  it('fills in empty properties when the type is object but properties is missing', () => {
    expect(normalizeToolParameterSchema({ type: 'object' })).toEqual({
      type: 'object',
      properties: {},
    });
  });
});

describe('normalizeToolParameterSchema — anyOf flattening (OpenAI/strict)', () => {
  it('flattens a top-level anyOf into a merged object schema', () => {
    const schema = {
      anyOf: [
        {
          type: 'object',
          properties: { common: { type: 'string' }, only_a: { type: 'number' } },
          required: ['common', 'only_a'],
        },
        {
          type: 'object',
          properties: { common: { type: 'string' }, only_b: { type: 'boolean' } },
          required: ['common', 'only_b'],
        },
      ],
    };
    const out = normalizeToolParameterSchema(schema) as Record<string, unknown>;
    expect(out['type']).toBe('object');
    const props = out['properties'] as Record<string, unknown>;
    expect(props['common']).toEqual({ type: 'string' });
    expect(props['only_a']).toEqual({ type: 'number' });
    expect(props['only_b']).toEqual({ type: 'boolean' });
    // Only `common` is required in BOTH variants — merged required is exactly that.
    expect(out['required']).toEqual(['common']);
  });

  it('merges enum variants across anyOf into a single union enum', () => {
    const schema = {
      anyOf: [
        {
          type: 'object',
          properties: { color: { type: 'string', enum: ['red'] } },
        },
        {
          type: 'object',
          properties: { color: { type: 'string', enum: ['blue'] } },
        },
      ],
    };
    const out = normalizeToolParameterSchema(schema) as Record<string, unknown>;
    const color = (out['properties'] as Record<string, unknown>)['color'] as Record<
      string,
      unknown
    >;
    expect(color['enum']).toEqual(['red', 'blue']);
    expect(color['type']).toBe('string');
  });
});

describe('normalizeToolParameterSchema — Gemini cleanup', () => {
  it('strips JSON Schema keywords Gemini rejects when modelProvider=google', () => {
    const schema = {
      type: 'object',
      properties: {
        s: { type: 'string', minLength: 1, maxLength: 10, pattern: '^foo' },
      },
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      additionalProperties: false,
    };
    const out = normalizeToolParameterSchema(schema, { modelProvider: 'google' }) as Record<
      string,
      unknown
    >;
    expect(out['$schema']).toBeUndefined();
    expect(out['additionalProperties']).toBeUndefined();
    const s = (out['properties'] as Record<string, unknown>)['s'] as Record<string, unknown>;
    expect(s['minLength']).toBeUndefined();
    expect(s['maxLength']).toBeUndefined();
    expect(s['pattern']).toBeUndefined();
    // The base type:string is preserved so Gemini still validates.
    expect(s['type']).toBe('string');
  });

  it('Anthropic provider does NOT strip Gemini keywords (they are valid for Anthropic)', () => {
    const schema = {
      type: 'object',
      properties: { s: { type: 'string', minLength: 1 } },
    };
    const out = normalizeToolParameterSchema(schema, { modelProvider: 'anthropic' }) as Record<
      string,
      unknown
    >;
    const s = (out['properties'] as Record<string, unknown>)['s'] as Record<string, unknown>;
    expect(s['minLength']).toBe(1);
  });
});

describe('normalizeToolParameterSchema — caller-supplied unsupportedKeywords (xAI etc.)', () => {
  it('strips caller-listed keywords recursively', () => {
    const schema = {
      type: 'object',
      properties: {
        s: { type: 'string', minLength: 1 },
        nested: {
          type: 'object',
          properties: {
            inner: { type: 'string', maxLength: 5 },
          },
        },
      },
    };
    const out = normalizeToolParameterSchema(schema, {
      unsupportedKeywords: new Set(['minLength', 'maxLength']),
    }) as Record<string, unknown>;
    const s = (out['properties'] as Record<string, unknown>)['s'] as Record<string, unknown>;
    const inner = (
      ((out['properties'] as Record<string, unknown>)['nested'] as Record<string, unknown>)[
        'properties'
      ] as Record<string, unknown>
    )['inner'] as Record<string, unknown>;
    expect(s['minLength']).toBeUndefined();
    expect(inner['maxLength']).toBeUndefined();
  });
});
