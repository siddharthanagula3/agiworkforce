import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  jsonSchemaFormatProblem,
  settleJsonSchemaCompletion,
  type JsonSchemaResponseFormat,
} from './json-schema-mode';

function formatFor(schema: Record<string, unknown>): JsonSchemaResponseFormat {
  return { name: 'receipt', schema };
}

describe('buffered JSON schema settlement', () => {
  it.each(['const', 'enum'])('compares composite %s values by JSON contents', (keyword) => {
    const fixed = { label: 'ok', nested: [1, { ready: true }] };
    const format = formatFor({
      type: 'object',
      properties: { record: { [keyword]: keyword === 'enum' ? [fixed] : fixed } },
      required: ['record'],
      additionalProperties: false,
    });
    expect(jsonSchemaFormatProblem(format)).toBeNull();
    const content = '{"record":{"nested":[1,{"ready":true}],"label":"ok"}}';
    expect(settleJsonSchemaCompletion(content, 'stop', format)).toEqual({ ok: true, content });
  });

  it.each(['const', 'enum'])('preserves array ordering for %s', (keyword) => {
    const format = formatFor({
      type: 'object',
      properties: { record: { [keyword]: keyword === 'enum' ? [[1, 2]] : [1, 2] } },
      required: ['record'],
    });
    expect(settleJsonSchemaCompletion('{"record":[1,2]}', 'stop', format).ok).toBe(true);
    expect(settleJsonSchemaCompletion('{"record":[2,1]}', 'stop', format)).toMatchObject({
      ok: false,
      code: 'json_schema_not_satisfied',
    });
  });

  it.each([
    '{"record":{"label":"other"}}',
    '{"record":{"label":"ok","extra":true}}',
    '{"record":[]}',
    '{"record":{"label":1}}',
  ])('rejects a different composite value: %s', (content) => {
    const format = formatFor({
      type: 'object',
      properties: { record: { const: { label: 'ok' } } },
      required: ['record'],
    });
    expect(settleJsonSchemaCompletion(content, 'stop', format)).toMatchObject({
      ok: false,
      status: 502,
      code: 'json_schema_not_satisfied',
    });
  });

  it.each(['constructor', 'toString', '__proto__'])('requires an own %s property', (name) => {
    const format = formatFor({
      type: 'object',
      properties: { [name]: { type: 'string' } },
      required: [name],
      additionalProperties: false,
    });
    expect(jsonSchemaFormatProblem(format)).toBeNull();
    expect(settleJsonSchemaCompletion('{}', 'stop', format)).toMatchObject({
      ok: false,
      message: expect.stringContaining(`$.${name} is missing`),
    });
    const content = JSON.stringify({ [name]: 'present' });
    expect(settleJsonSchemaCompletion(content, 'stop', format)).toEqual({ ok: true, content });
    expect(settleJsonSchemaCompletion(JSON.stringify({ [name]: 1 }), 'stop', format).ok).toBe(
      false,
    );
  });

  it('rejects an undeclared prototype-named property', () => {
    const format = formatFor({ type: 'object', properties: {}, additionalProperties: false });
    expect(settleJsonSchemaCompletion('{"__proto__":{}}', 'stop', format)).toMatchObject({
      ok: false,
      message: expect.stringContaining('$.__proto__ is not allowed'),
    });
  });

  it('compares signed zero by mathematical value inside composites', () => {
    const format = formatFor({ type: 'object', const: { value: 0 } });
    expect(settleJsonSchemaCompletion('{"value":-0}', 'stop', format).ok).toBe(true);
  });

  it('enforces terminal constraints through local reference aliases', () => {
    const format = formatFor({
      type: 'object',
      $defs: {
        Count: { type: 'integer', minimum: 1 },
        Alias: { $ref: '#/$defs/Count' },
      },
      properties: { count: { $ref: '#/$defs/Alias' } },
      required: ['count'],
      additionalProperties: false,
    });
    expect(jsonSchemaFormatProblem(format)).toBeNull();
    expect(settleJsonSchemaCompletion('{"count":1}', 'stop', format).ok).toBe(true);
    for (const content of ['{"count":"not an integer"}', '{"count":0}']) {
      expect(settleJsonSchemaCompletion(content, 'stop', format)).toMatchObject({
        ok: false,
        code: 'json_schema_not_satisfied',
      });
    }
  });

  it.each([
    ['a/b', '#/$defs/a~1b'],
    ['a~b', '#/$defs/a~0b'],
    ['a/b', '#/$defs/a%7E1b'],
    ['a~1b', '#/$defs/a~01b'],
    ['', '#/$defs/'],
    ['__proto__', '#/$defs/__proto__'],
  ])('resolves an own escaped definition %s through %s', (name, reference) => {
    const format = formatFor({
      type: 'object',
      $defs: { [name]: { type: 'integer', minimum: 1 } },
      properties: { count: { $ref: reference } },
    });
    expect(jsonSchemaFormatProblem(format)).toBeNull();
    expect(settleJsonSchemaCompletion('{"count":1}', 'stop', format).ok).toBe(true);
    expect(settleJsonSchemaCompletion('{"count":0}', 'stop', format).ok).toBe(false);
  });

  it('resolves nested pointer components and also enforces reference siblings', () => {
    const format = formatFor({
      type: 'object',
      $defs: { record: { type: 'object', properties: { count: { type: 'integer', minimum: 1 } } } },
      properties: { count: { $ref: '#/$defs/record/properties/count', maximum: 3 } },
    });
    expect(jsonSchemaFormatProblem(format)).toBeNull();
    expect(settleJsonSchemaCompletion('{"count":2}', 'stop', format).ok).toBe(true);
    expect(settleJsonSchemaCompletion('{"count":0}', 'stop', format).ok).toBe(false);
    expect(settleJsonSchemaCompletion('{"count":4}', 'stop', format).ok).toBe(false);
  });

  it('resolves canonical array indices inside an admitted schema location', () => {
    const format = formatFor({
      type: 'object',
      $defs: { record: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'string' }] } },
      properties: { count: { $ref: '#/$defs/record/anyOf/0' } },
    });
    expect(jsonSchemaFormatProblem(format)).toBeNull();
    expect(settleJsonSchemaCompletion('{"count":1}', 'stop', format).ok).toBe(true);
    expect(settleJsonSchemaCompletion('{"count":"invalid"}', 'stop', format).ok).toBe(false);
    format.schema['properties'] = { count: { $ref: '#/$defs/record/anyOf/01' } };
    expect(jsonSchemaFormatProblem(format)).not.toBeNull();
  });

  it.each([
    { $ref: '#/$defs/missing' },
    { $ref: '#/$defs/%invalid' },
    { $defs: { 'a~2b': { type: 'integer' } }, properties: { count: { $ref: '#/$defs/a~2b' } } },
    { $defs: {}, properties: { count: { $ref: '#/$defs/__proto__' } } },
    {
      $defs: { record: { properties: { count: { type: 'integer' } } } },
      $ref: '#/$defs/record/properties',
    },
    { $defs: { A: { $ref: '#/$defs/B' }, B: { $ref: '#/$defs/A' } }, $ref: '#/$defs/A' },
    { $defs: { A: { anyOf: [{ $ref: '#/$defs/A' }, { type: 'null' }] } }, $ref: '#/$defs/A' },
  ])('rejects unenforceable local references before dispatch: %j', (schema) => {
    expect(jsonSchemaFormatProblem(formatFor({ type: 'object', ...schema }))).not.toBeNull();
  });

  it('supports recursive references that advance to child values', () => {
    const format = formatFor({
      type: 'object',
      $defs: {
        Node: {
          anyOf: [
            { type: 'null' },
            {
              type: 'object',
              properties: { count: { type: 'integer' }, next: { $ref: '#/$defs/Node' } },
              required: ['count', 'next'],
              additionalProperties: false,
            },
          ],
        },
      },
      properties: { node: { $ref: '#/$defs/Node' } },
      required: ['node'],
    });
    expect(jsonSchemaFormatProblem(format)).toBeNull();
    expect(
      settleJsonSchemaCompletion(
        '{"node":{"count":1,"next":{"count":2,"next":null}}}',
        'stop',
        format,
      ).ok,
    ).toBe(true);
    expect(
      settleJsonSchemaCompletion(
        '{"node":{"count":1,"next":{"count":"invalid","next":null}}}',
        'stop',
        format,
      ).ok,
    ).toBe(false);
  });

  it('bounds reference expansion before provider work and settlement', () => {
    const definitions: Record<string, unknown> = { terminal: { type: 'integer' } };
    let reference = '#/$defs/terminal';
    for (let index = 0; index < 10; index += 1) {
      definitions[`alias${index}`] = { $ref: reference };
      reference = `#/$defs/alias${index}`;
    }
    const format = formatFor({ type: 'object', $defs: definitions });
    expect(jsonSchemaFormatProblem(format)).toBeNull();
    format.schema['properties'] = { count: { $ref: reference } };
    expect(jsonSchemaFormatProblem(format)).toMatch(/references deeper than 10/);
    expect(settleJsonSchemaCompletion('{"count":1}', 'stop', format)).toMatchObject({
      ok: false,
      code: 'json_schema_not_satisfied',
    });
  });
});
