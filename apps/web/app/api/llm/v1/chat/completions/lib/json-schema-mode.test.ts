import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { GCProfiler, setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { RE2JS } from 're2js';
import {
  jsonSchemaFormatProblem,
  settleJsonSchemaCompletion,
  type JsonSchemaResponseFormat,
} from './json-schema-mode';

setFlagsFromString('--expose-gc');
const collectGarbage = runInNewContext('gc') as () => void;

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

  describe('bounded evaluation', () => {
    const unmatchable = { type: 'number', minimum: 2, maximum: 1 };

    function fanOutSchema(
      width: number,
      levels: number,
      lastOption?: Record<string, unknown>,
    ): Record<string, unknown> {
      const options = (target: string) =>
        Array.from({ length: width }, () => ({ $ref: `#/$defs/${target}` }));
      const definitions: Record<string, unknown> = { leaf: unmatchable };
      for (let level = levels; level >= 2; level -= 1) {
        definitions[`level${level}`] = {
          anyOf: options(level === levels ? 'leaf' : `level${level + 1}`),
        };
      }
      const top = lastOption ? [...options('level2'), lastOption] : options('level2');
      return {
        type: 'object',
        $defs: definitions,
        properties: { value: { anyOf: top } },
        required: ['value'],
      };
    }

    it('settles a shared-reference fan-out quickly and reports the real mismatch', () => {
      const format = formatFor(fanOutSchema(40, 5));
      expect(jsonSchemaFormatProblem(format)).toBeNull();
      const started = performance.now();
      const settlement = settleJsonSchemaCompletion('{"value":3}', 'stop', format);
      expect(performance.now() - started).toBeLessThan(2_000);
      expect(settlement).toMatchObject({
        ok: false,
        status: 502,
        code: 'json_schema_not_satisfied',
        message: expect.stringContaining('$.value matches none of the allowed shapes'),
      });
      expect(settlement).not.toMatchObject({
        message: expect.stringContaining('too expensive'),
      });
    }, 20_000);

    it('still accepts a value that one option of a wide fan-out matches', () => {
      const schema = fanOutSchema(40, 5);
      (schema['$defs'] as Record<string, unknown>)['leaf'] = { type: 'number' };
      const format = formatFor(schema);
      expect(settleJsonSchemaCompletion('{"value":3}', 'stop', format).ok).toBe(true);
    });

    it('accepts a value that only the option after a failing fan-out matches', () => {
      const format = formatFor(fanOutSchema(40, 5, { type: 'number' }));
      expect(jsonSchemaFormatProblem(format)).toBeNull();
      expect(settleJsonSchemaCompletion('{"value":3}', 'stop', format)).toEqual({
        ok: true,
        content: '{"value":3}',
      });
    });

    it('fails closed when the evaluation budget runs out', () => {
      const format = formatFor({
        type: 'object',
        properties: {
          rows: {
            type: 'array',
            items: { type: 'object', properties: { id: { type: 'integer' } } },
          },
        },
      });
      const rows = Array.from({ length: 250_000 }, (_, id) => ({ id }));
      const settlement = settleJsonSchemaCompletion(JSON.stringify({ rows }), 'stop', format);
      expect(settlement).toMatchObject({ ok: false, code: 'json_schema_not_satisfied' });
    });

    it('rejects a schema with too many anyOf options at admission', () => {
      const format = formatFor({
        type: 'object',
        properties: { value: { anyOf: Array.from({ length: 101 }, () => ({ type: 'null' })) } },
      });
      expect(jsonSchemaFormatProblem(format)).toMatch(/anyOf has more than 100 options/);
      const ok = formatFor({
        type: 'object',
        properties: { value: { anyOf: Array.from({ length: 100 }, () => ({ type: 'null' })) } },
      });
      expect(jsonSchemaFormatProblem(ok)).toBeNull();
    });

    it('rejects a schema with too many nodes at admission', () => {
      const withGroups = (count: number) => {
        const properties: Record<string, unknown> = {};
        for (let index = 0; index < count; index += 1) {
          properties[`g${index}`] = { anyOf: Array.from({ length: 100 }, () => ({})) };
        }
        return formatFor({ type: 'object', properties });
      };
      expect(jsonSchemaFormatProblem(withGroups(50))).toMatch(/more than 5000 schema objects/);
      expect(jsonSchemaFormatProblem(withGroups(49))).toBeNull();
    });
  });

  describe('patterns', () => {
    const patternFormat = (pattern: string) =>
      formatFor({
        type: 'object',
        properties: { code: { type: 'string', pattern } },
        required: ['code'],
      });

    it('does not backtrack catastrophically on a nested quantifier', () => {
      const format = patternFormat('^(a+)+$');
      expect(jsonSchemaFormatProblem(format)).toBeNull();
      const started = performance.now();
      const settlement = settleJsonSchemaCompletion(
        JSON.stringify({ code: `${'a'.repeat(40)}!` }),
        'stop',
        format,
      );
      expect(performance.now() - started).toBeLessThan(2_000);
      expect(settlement).toMatchObject({ ok: false, code: 'json_schema_not_satisfied' });
      expect(
        settleJsonSchemaCompletion(JSON.stringify({ code: 'a'.repeat(40) }), 'stop', format).ok,
      ).toBe(true);
    });

    it.each([
      ['^[A-Z]{3}-\\d{4}$', 'ABC-1234', 'abc-1234'],
      ['^@[a-zA-Z0-9_]+$', '@agi_1', 'agi'],
      ['ab+c', 'xxabbbc', 'cbbba'],
      ['^\\p{L}+$', 'héllo', 'h3llo'],
      ['^.$', '😀', '😀😀'],
    ])('keeps matching %s as before', (pattern, match, mismatch) => {
      const format = patternFormat(pattern);
      expect(jsonSchemaFormatProblem(format)).toBeNull();
      expect(settleJsonSchemaCompletion(JSON.stringify({ code: match }), 'stop', format).ok).toBe(
        true,
      );
      expect(
        settleJsonSchemaCompletion(JSON.stringify({ code: mismatch }), 'stop', format),
      ).toMatchObject({
        ok: false,
        code: 'json_schema_not_satisfied',
      });
    });

    it.each(['(?=a)a', '(?<=a)b', '(a)\\1', '(', 'a{1001}', 'a'.repeat(1_025)])(
      'rejects the unsupported pattern %s at admission',
      (pattern) => {
        expect(jsonSchemaFormatProblem(patternFormat(pattern))).toMatch(
          /uses an unsupported pattern/,
        );
      },
    );

    it.each([
      { pattern: '^(?=a)a$', construct: 'lookahead `(?=`' },
      { pattern: '^(?!a)b$', construct: 'lookahead `(?!`' },
      { pattern: '(?<=a)b', construct: 'lookbehind `(?<=`' },
      { pattern: '(?<!a)b', construct: 'lookbehind `(?<!`' },
      { pattern: '^(a)\\1$', construct: 'back-reference `\\1`' },
      { pattern: '^(?<x>a)\\k<x>$', construct: 'back-reference `\\k<x>`' },
      {
        pattern: '^(?P<x>a)(?P=x)$',
        construct: 'not an ECMA-262 regular expression (Invalid group)',
      },
      {
        pattern: '^[[:alpha:]]+$',
        construct: 'not an ECMA-262 regular expression (Lone quantifier brackets)',
      },
      { pattern: '(?i)abc', construct: 'not an ECMA-262 regular expression (Invalid group)' },
      { pattern: '^\\x{41}$', construct: 'not an ECMA-262 regular expression (Invalid escape)' },
      {
        pattern: '^\\p{Script=Latin}+$',
        construct: 'invalid character class range `\\p{Script=Latin}`',
      },
      { pattern: '^\\p{Letter}+$', construct: 'invalid character class range `\\p{Letter}`' },
      { pattern: '^.{1,5000}$', construct: 'invalid repeat count `{1,5000}`' },
      { pattern: '\\cJ', construct: 'invalid escape sequence `\\c`' },
      { pattern: 'a\\', construct: 'not an ECMA-262 regular expression (\\ at end of pattern)' },
      { pattern: 'a'.repeat(1_025), construct: 'longer than 1024 characters' },
      { pattern: '^(?m:a$)', construct: 'modifier group `(?m:`' },
      { pattern: '^(?-m:a$)', construct: 'modifier group `(?-m:`' },
      { pattern: '^(?i:\u00df)$', construct: 'modifier group `(?i:`' },
      { pattern: '^(?s:.)$', construct: 'modifier group `(?s:`' },
      { pattern: '^(?-i:a)$', construct: 'modifier group `(?-i:`' },
      { pattern: '^x(?i-ms:a)$', construct: 'modifier group `(?i-ms:`' },
      { pattern: '^[a](?:b(?m:c$))$', construct: 'modifier group `(?m:`' },
    ])('refuses a pattern at admission and names $construct', ({ pattern, construct }) => {
      expect(jsonSchemaFormatProblem(patternFormat(pattern))).toBe(
        `schema.properties.code uses an unsupported pattern: ${construct}`,
      );
    });

    it.each([
      ['^(?<year>\\d{4})-(?<month>\\d{2})$', '2026-11', '2026-1x'],
      ['^[^]$', '\n', ''],
      ['^(?:a[]|b)$', 'b', 'a'],
      ['^[(?=]+$', '(?=', 'a'],
      ['^[\\]]$', ']', '['],
      ['^[(?m:]+$', '(?m:', 'x'],
      ['^\\(\\?m:a\\)$', '(?m:a)', 'a'],
    ])('translates the ECMAScript form %s', (pattern, match, mismatch) => {
      const format = patternFormat(pattern);
      expect(jsonSchemaFormatProblem(format)).toBeNull();
      expect(settleJsonSchemaCompletion(JSON.stringify({ code: match }), 'stop', format).ok).toBe(
        true,
      );
      expect(new RegExp(pattern, 'u').test(match)).toBe(true);
      expect(new RegExp(pattern, 'u').test(mismatch)).toBe(false);
      expect(
        settleJsonSchemaCompletion(JSON.stringify({ code: mismatch }), 'stop', format),
      ).toMatchObject({ ok: false, code: 'json_schema_not_satisfied' });
    });

    describe('where RE2 differs from JavaScript (github.com/google/re2/wiki/Syntax)', () => {
      const settles = (pattern: string, code: string) =>
        settleJsonSchemaCompletion(JSON.stringify({ code }), 'stop', patternFormat(pattern)).ok;

      it.each([' ', '\t', '\n', '\r', '\f'])('\\s matches the ASCII space %j', (space) => {
        expect(settles('^\\s$', space)).toBe(true);
      });

      it.each(['\u00a0', '\u2003', '\ufeff', '\v'])(
        '\\s does not match the non-ASCII or vertical-tab space %j, unlike JavaScript',
        (space) => {
          expect(new RegExp('^\\s$').test(space)).toBe(true);
          expect(settles('^\\s$', space)).toBe(false);
        },
      );

      it.each(['\r', '\u2028', '\u2029'])(
        '. matches the line terminator %j that JavaScript excludes',
        (terminator) => {
          expect(new RegExp('^.$').test(terminator)).toBe(false);
          expect(settles('^.$', terminator)).toBe(true);
        },
      );

      it('. still does not match a line feed', () => {
        expect(settles('^.$', '\n')).toBe(false);
      });
    });

    it.each([
      ['\\u0041', 'A', 'B'],
      ['^\\u{1F600}$', '😀', '😁'],
      ['^\\uD83D\\uDE00$', '😀', '😁'],
      ['^[\\u0041-\\u005A]+$', 'ABC', 'abc'],
      ['^[^\\u0041]$', 'B', 'A'],
      ['^\\\\u0041$', '\\u0041', 'A'],
      ['^\\\\\\u0041$', '\\A', 'A'],
    ])('treats the JavaScript escape in %s as before', (pattern, match, mismatch) => {
      const format = patternFormat(pattern);
      expect(jsonSchemaFormatProblem(format)).toBeNull();
      expect(settleJsonSchemaCompletion(JSON.stringify({ code: match }), 'stop', format).ok).toBe(
        true,
      );
      expect(
        settleJsonSchemaCompletion(JSON.stringify({ code: mismatch }), 'stop', format),
      ).toMatchObject({ ok: false, code: 'json_schema_not_satisfied' });
    });

    it.each(['\\u00', '\\u{}', '\\u{110000}', '\\uZZZZ'])(
      'rejects the malformed escape %s at admission',
      (pattern) => {
        expect(jsonSchemaFormatProblem(patternFormat(pattern))).toMatch(
          /uses an unsupported pattern/,
        );
      },
    );

    it('fails closed on a string too long to check against its pattern', () => {
      const format = patternFormat('^a+$');
      expect(
        settleJsonSchemaCompletion(JSON.stringify({ code: 'a'.repeat(100_001) }), 'stop', format),
      ).toMatchObject({ ok: false, code: 'json_schema_not_satisfied' });
      expect(
        settleJsonSchemaCompletion(JSON.stringify({ code: 'a'.repeat(100_000) }), 'stop', format)
          .ok,
      ).toBe(true);
    });

    describe('evaluation cost', () => {
      afterEach(() => {
        vi.restoreAllMocks();
      });

      function mixedLetters(length: number, letters: readonly string[] = ['a', 'b']): string {
        let state = 12_345;
        let text = '';
        for (let index = 0; index < length; index += 1) {
          state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
          text += letters[(state >>> 16) % letters.length];
        }
        return text;
      }

      function testedCharacters(): () => number {
        const test = vi.spyOn(RE2JS.prototype, 'test');
        return () =>
          test.mock.calls.reduce(
            (total, [subject]) => total + (typeof subject === 'string' ? subject.length : 0),
            0,
          );
      }

      it('mixes both letters evenly', () => {
        const text = mixedLetters(100_000);
        const b = text.split('').filter((letter) => letter === 'b').length;
        expect(b).toBeGreaterThan(45_000);
        expect(b).toBeLessThan(55_000);
      });

      it('settles a typical 100 KB reply against a schema with a few short patterns', () => {
        const patterns = {
          id: '^usr_[A-Za-z0-9]{16}$',
          created: '^\\d{4}-\\d{2}-\\d{2}$',
          email: '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$',
          phone: '^\\+?[0-9 ()-]{7,20}$',
        };
        const plain = Array.from({ length: 26 }, (_, index) => `field${index}`);
        const record = {
          type: 'object',
          properties: {
            ...Object.fromEntries(
              Object.entries(patterns).map(([name, pattern]) => [
                name,
                { type: 'string', pattern },
              ]),
            ),
            ...Object.fromEntries(
              plain.map((name, index) => [
                name,
                { type: ['string', 'integer', 'boolean'][index % 3] },
              ]),
            ),
          },
          required: [...Object.keys(patterns), ...plain],
          additionalProperties: false,
        };
        const format = formatFor({
          type: 'object',
          properties: { records: { type: 'array', items: record } },
          required: ['records'],
          additionalProperties: false,
        });
        expect(Object.keys(record.properties)).toHaveLength(30);
        expect(jsonSchemaFormatProblem(format)).toBeNull();
        const records = Array.from({ length: 142 }, (_, row) => ({
          id: `usr_${String(row).padStart(16, 'A')}`,
          created: `2026-${String((row % 12) + 1).padStart(2, '0')}-${String((row % 28) + 1).padStart(2, '0')}`,
          email: `person.number${row}@example-mail.co.uk`,
          phone: `+1 (555) 01${String(row % 100).padStart(2, '0')}-${row % 10}`,
          ...Object.fromEntries(
            plain.map((name, index) => [
              name,
              [`value ${row}-${index} lorem ipsum`, row * index, row % 2 === 0][index % 3],
            ]),
          ),
        }));
        const content = JSON.stringify({ records });
        expect(content.length).toBeGreaterThan(95_000);
        expect(content.length).toBeLessThanOrEqual(100_000);
        expect(settleJsonSchemaCompletion(content, 'stop', format)).toEqual({ ok: true, content });
      });

      it.each(["^[\\p{L} .'-]+$", '^\\p{Lu}\\p{Ll}+$', '^[\\p{L}\\p{N}_-]{3,32}$'])(
        'settles a hundred records whose names must match the Unicode letter pattern %s',
        (pattern) => {
          const format = formatFor({
            type: 'object',
            properties: {
              people: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { name: { type: 'string', pattern } },
                  required: ['name'],
                  additionalProperties: false,
                },
              },
            },
            required: ['people'],
            additionalProperties: false,
          });
          expect(jsonSchemaFormatProblem(format)).toBeNull();
          const people = Array.from({ length: 100 }, (_, row) => ({
            name: `Zoëabcdefghi${String.fromCharCode(97 + (row % 26))}`,
          }));
          const content = JSON.stringify({ people });
          expect(settleJsonSchemaCompletion(content, 'stop', format)).toEqual({
            ok: true,
            content,
          });
          expect(
            settleJsonSchemaCompletion(
              JSON.stringify({ people: [...people, { name: '42' }] }),
              'stop',
              format,
            ),
          ).toMatchObject({
            ok: false,
            message: expect.stringContaining('$.people[100].name does not match its pattern'),
          });
        },
      );

      const letterAt = (row: number) => String.fromCharCode(97 + (row % 26));

      it.each([
        [
          '^[\\p{L}\\p{N}._%+-]+@[\\p{L}\\p{N}.-]+\\.\\p{L}{2,}$',
          (row: number) => `zoë.ångström${row % 10}@exämple.${letterAt(row)}o`,
          'zoë@exämple',
        ],
        [
          '^\\p{L}[\\p{L} ]*\\p{L}$',
          (row: number) => `Zoë Ångström Øster ${letterAt(row)}ñ`,
          'Zoë 4',
        ],
        [
          '^(?:\\p{L}+ )*\\p{L}+$',
          (row: number) => `Zoë Ångström Øster ${letterAt(row)}ñ`,
          'Zoë  Ø',
        ],
        ['^.*\\p{L}.*$', (row: number) => `${row} - ${row * 7} ünï ${row * 13}`, '12 - 84'],
        ['\\p{L}', (row: number) => `${row} - ${row * 7} ünï ${row * 13}`, '12 - 84'],
        ['\\p{Lu}', (row: number) => `${row} - ${row * 7} Ünï ${row * 13}`, '12 - ünï'],
      ])(
        'settles a hundred records whose values must match the Unicode pattern %s',
        (pattern, valueFor, mismatch) => {
          const format = formatFor({
            type: 'object',
            properties: {
              rows: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { value: { type: 'string', pattern } },
                  required: ['value'],
                  additionalProperties: false,
                },
              },
            },
            required: ['rows'],
            additionalProperties: false,
          });
          expect(jsonSchemaFormatProblem(format)).toBeNull();
          const rows = Array.from({ length: 100 }, (_, row) => ({ value: valueFor(row) }));
          expect(rows.every(({ value }) => new RegExp(pattern, 'u').test(value))).toBe(true);
          expect(rows.reduce((total, { value }) => total + value.length, 0)).toBeGreaterThan(1_500);
          const content = JSON.stringify({ rows });
          expect(settleJsonSchemaCompletion(content, 'stop', format)).toEqual({
            ok: true,
            content,
          });
          expect(new RegExp(pattern, 'u').test(mismatch)).toBe(false);
          expect(
            settleJsonSchemaCompletion(
              JSON.stringify({ rows: [...rows, { value: mismatch }] }),
              'stop',
              format,
            ),
          ).toMatchObject({
            ok: false,
            message: expect.stringContaining('$.rows[100].value does not match its pattern'),
          });
        },
      );

      it('settles a 100 KB reply whose names, emails, identifiers and dates use Unicode classes', () => {
        const patterns = {
          name: "^\\p{Lu}[\\p{L}' -]*\\p{L}$",
          email: '^[\\p{L}\\p{N}._%+-]+@[\\p{L}\\p{N}.-]+\\.\\p{L}{2,}$',
          handle: '^[\\p{L}_][\\p{L}\\p{N}_]{2,31}$',
          born: '^\\p{Nd}{4}-\\p{Nd}{2}-\\p{Nd}{2}$',
          city: '^\\p{L}+(?:[ -]\\p{L}+)*$',
        };
        const plain = Array.from({ length: 6 }, (_, index) => `field${index}`);
        const record = {
          type: 'object',
          properties: {
            ...Object.fromEntries(
              Object.entries(patterns).map(([name, pattern]) => [
                name,
                { type: 'string', pattern },
              ]),
            ),
            ...Object.fromEntries(plain.map((name) => [name, { type: 'string' }])),
          },
          required: [...Object.keys(patterns), ...plain],
          additionalProperties: false,
        };
        const format = formatFor({
          type: 'object',
          properties: { people: { type: 'array', items: record } },
          required: ['people'],
          additionalProperties: false,
        });
        expect(jsonSchemaFormatProblem(format)).toBeNull();
        const cities = ['São Paulo', 'Zürich', 'Kraków', 'Saint-Étienne', 'Москва', '東京'];
        const people = Array.from({ length: 258 }, (_, row) => ({
          name: `Zoë Ångström-O'Neill ${letterAt(row).toUpperCase()}ñez`,
          email: `zoë.ångström.${row}@exämple-${letterAt(row)}.co.uk`,
          handle: `ñandú_${row}_${letterAt(row * 7)}`,
          born: `19${String(row % 100).padStart(2, '0')}-${String((row % 12) + 1).padStart(2, '0')}-${String((row % 28) + 1).padStart(2, '0')}`,
          city: cities[row % cities.length] ?? '',
          ...Object.fromEntries(
            plain.map((name, index) => [name, `value ${row}-${index} lorem ipsum dolor`]),
          ),
        }));
        expect(
          people.every((person) =>
            Object.entries(patterns).every(([name, pattern]) =>
              new RegExp(pattern, 'u').test(person[name as keyof typeof patterns]),
            ),
          ),
        ).toBe(true);
        const content = JSON.stringify({ people });
        expect(content.length).toBeGreaterThan(95_000);
        expect(content.length).toBeLessThanOrEqual(100_000);
        expect(settleJsonSchemaCompletion(content, 'stop', format)).toEqual({ ok: true, content });
      });

      it.each([
        {
          form: 'ASCII',
          patterns: {
            handle: '^[A-Za-z_][A-Za-z0-9_]{2,31}$',
            name: "^[A-Za-z][A-Za-z '-]{0,62}[A-Za-z]$",
            slug: '^[a-z0-9]+(?:-[a-z0-9]+){0,7}$',
            code: '^[A-Z]{2,4}-\\d{1,6}$',
          },
          record: (row: number) => ({
            handle: `user_${row}_${letterAt(row * 7)}${'x'.repeat(10 + (row % 12))}`,
            name: `Anne-Marie O'Neill ${letterAt(row).toUpperCase()}astbourne Smithson-Wellington Fair`,
            slug: `team-${letterAt(row)}-${row}-north-east-division`,
            code: `AB${letterAt(row).toUpperCase()}-${row}`,
          }),
        },
        {
          form: 'Unicode-class',
          patterns: {
            handle: '^[\\p{L}_][\\p{L}\\p{N}_]{2,31}$',
            name: "^\\p{L}[\\p{L} '-]{0,62}\\p{L}$",
            slug: '^[\\p{Ll}\\p{N}]+(?:-[\\p{Ll}\\p{N}]+){0,7}$',
            code: '^\\p{Lu}{2,4}-\\p{Nd}{1,6}$',
          },
          record: (row: number) => ({
            handle: `ñandú_${row}_${letterAt(row * 7)}${'ø'.repeat(10 + (row % 12))}`,
            name: `Zoë Ångström-O'Neill ${letterAt(row).toUpperCase()}ñez Østergård-Wellington Fairweather`,
            slug: `équipe-${letterAt(row)}-${row}-nord-est-division`,
            code: `ÅB${letterAt(row).toUpperCase()}-${row}`,
          }),
        },
      ])(
        'settles a 100 KB $form reply dense with length-bounded identifiers and names',
        ({ patterns, record }) => {
          const format = formatFor({
            type: 'object',
            properties: {
              people: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: Object.fromEntries(
                    Object.entries(patterns).map(([name, pattern]) => [
                      name,
                      { type: 'string', pattern },
                    ]),
                  ),
                  required: Object.keys(patterns),
                  additionalProperties: false,
                },
              },
            },
            required: ['people'],
            additionalProperties: false,
          });
          expect(jsonSchemaFormatProblem(format)).toBeNull();
          const people = Array.from({ length: 600 }, (_, row) => record(row));
          const values = people.flatMap((person) => Object.entries(person));
          expect(
            values.every(([name, value]) =>
              new RegExp(patterns[name as keyof typeof patterns], 'u').test(value),
            ),
          ).toBe(true);
          const checked = values.reduce((total, [, value]) => total + value.length, 0);
          const content = JSON.stringify({ people });
          expect(content.length).toBeGreaterThan(95_000);
          expect(content.length).toBeLessThanOrEqual(100_000);
          expect(checked / content.length).toBeGreaterThan(0.7);
          const started = performance.now();
          expect(settleJsonSchemaCompletion(content, 'stop', format)).toEqual({
            ok: true,
            content,
          });
          expect(performance.now() - started).toBeLessThan(2_000);
          const broken = [...people.slice(0, -1), { ...people.at(-1), handle: '9starts_badly' }];
          expect(
            settleJsonSchemaCompletion(JSON.stringify({ people: broken }), 'stop', format),
          ).toMatchObject({
            ok: false,
            message: expect.stringContaining('$.people[599].handle does not match its pattern'),
          });
        },
        30_000,
      );

      function anyOfPatterns(patterns: string[]): Record<string, unknown> {
        return {
          type: 'object',
          properties: {
            value: { anyOf: patterns.map((pattern) => ({ type: 'string', pattern })) },
          },
          required: ['value'],
        };
      }

      it('refuses at admission a schema whose patterns together compile past the cap', () => {
        const properties = Object.fromEntries(
          Array.from({ length: 7 }, (_, group) => [
            `group${group}`,
            {
              anyOf: Array.from({ length: 92 }, () => ({
                type: 'string',
                pattern: '[a-z]{1000}0',
              })),
            },
          ]),
        );
        const format = formatFor({ type: 'object', properties });
        expect(JSON.stringify(format.schema).length).toBeLessThan(32_000);
        expect(jsonSchemaFormatProblem(format)).toBe(
          'the schema patterns are too large to enforce together',
        );
      });

      const costlyPatterns = (repeat: number) =>
        Array.from({ length: 50 }, (_, index) => `[a-z]*a[a-z]{${repeat - index}}[0-9]`);
      const expensiveReply = {
        ok: false,
        code: 'json_schema_not_satisfied',
        message: expect.stringContaining('too expensive to check'),
      };

      it('settles a 100,000-character reply against fifty large patterns quickly', () => {
        const format = formatFor(anyOfPatterns(costlyPatterns(900)));
        expect(jsonSchemaFormatProblem(format)).toBeNull();
        const started = performance.now();
        const settlement = settleJsonSchemaCompletion(
          JSON.stringify({ value: mixedLetters(100_000) }),
          'stop',
          format,
        );
        expect(performance.now() - started).toBeLessThan(2_000);
        expect(settlement).toMatchObject(expensiveReply);
      });

      it('bounds the total work when each test alone fits the budget', () => {
        const format = formatFor(anyOfPatterns(costlyPatterns(200)));
        const started = performance.now();
        const settlement = settleJsonSchemaCompletion(
          JSON.stringify({ value: mixedLetters(3_000) }),
          'stop',
          format,
        );
        expect(performance.now() - started).toBeLessThan(2_000);
        expect(settlement).toMatchObject(expensiveReply);
      });

      it('still checks a long string against a small pattern', () => {
        const format = formatFor(anyOfPatterns(['^[ab]+$']));
        const content = JSON.stringify({ value: mixedLetters(100_000) });
        expect(settleJsonSchemaCompletion(content, 'stop', format)).toEqual({ ok: true, content });
      });

      it('stops before patterns whose matcher builds a new state for every character', () => {
        const format = formatFor(
          anyOfPatterns(
            Array.from({ length: 40 }, (_, index) => `(?:a|b|z${index})*a(?:a|b){16}$`),
          ),
        );
        expect(jsonSchemaFormatProblem(format)).toBeNull();
        const characters = testedCharacters();
        const settlement = settleJsonSchemaCompletion(
          JSON.stringify({ value: `${mixedLetters(9_983)}b${'a'.repeat(16)}` }),
          'stop',
          format,
        );
        expect(settlement).toMatchObject(expensiveReply);
        expect(characters()).toBeLessThanOrEqual(60_000);
      });

      const rowsMatching = (pattern: string) =>
        formatFor({
          type: 'object',
          properties: { rows: { type: 'array', items: { type: 'string', pattern } } },
          required: ['rows'],
        });

      it('charges a one-pass matcher for every instruction it walks per character', () => {
        const pattern = `^(?:${'()'.repeat(300)}a)*$`;
        const format = rowsMatching(pattern);
        expect(jsonSchemaFormatProblem(format)).toBeNull();
        const compiled = RE2JS.compile(pattern).re2Input;
        expect(compiled.onepass).not.toBeNull();
        expect(Number(compiled.numberOfInstructions())).toBeLessThan(1_000);
        const characters = testedCharacters();
        const started = performance.now();
        const settlement = settleJsonSchemaCompletion(
          JSON.stringify({ rows: Array.from({ length: 2_900 }, () => 'a'.repeat(400)) }),
          'stop',
          format,
        );
        expect(performance.now() - started).toBeLessThan(2_000);
        expect(settlement).toMatchObject(expensiveReply);
        expect(characters()).toBeLessThanOrEqual(5 * 400);
      }, 60_000);

      it('charges the full worst case once a lazy DFA falls back to the slower matcher', () => {
        const format = formatFor({
          type: 'object',
          properties: {
            rows: {
              type: 'array',
              items: {
                anyOf: [
                  { type: 'string', pattern: '[ab]*a[ab]{1000}$' },
                  { type: 'string', pattern: '^[ab]*$' },
                ],
              },
            },
          },
          required: ['rows'],
        });
        expect(jsonSchemaFormatProblem(format)).toBeNull();
        const rows = [
          mixedLetters(1_400),
          ...Array.from({ length: 2_500 }, (_, row) => mixedLetters(300 + (row % 2))),
        ];
        const characters = testedCharacters();
        const started = performance.now();
        const settlement = settleJsonSchemaCompletion(JSON.stringify({ rows }), 'stop', format);
        expect(performance.now() - started).toBeLessThan(2_000);
        expect(settlement).toMatchObject(expensiveReply);
        expect(characters()).toBeLessThanOrEqual(1_400);
      }, 60_000);

      it('refuses a test whose worst case does not fit the remaining budget before running it', () => {
        const pattern = `[a-z]*a${'[a-z]{1000}[0-9]{1000}'.repeat(3)}$`;
        const format = rowsMatching(pattern);
        expect(jsonSchemaFormatProblem(format)).toBeNull();
        expect(Number(RE2JS.compile(pattern).re2Input.numberOfInstructions())).toBeGreaterThan(
          5_000,
        );
        const characters = testedCharacters();
        const started = performance.now();
        const settlement = settleJsonSchemaCompletion(
          JSON.stringify({ rows: [mixedLetters(100_000)] }),
          'stop',
          format,
        );
        expect(performance.now() - started).toBeLessThan(2_000);
        expect(settlement).toMatchObject(expensiveReply);
        expect(characters()).toBe(0);
      }, 60_000);

      it('charges a lazy DFA for the transitions it computes, not only the memory it keeps', () => {
        const letters = Array.from({ length: 200 }, (_, index) =>
          String.fromCodePoint(0x100 + index),
        );
        const pattern = letters.map((letter) => `${letter}${letter}`).join('|');
        const format = rowsMatching(pattern);
        expect(pattern.length).toBeLessThanOrEqual(1_024);
        expect(jsonSchemaFormatProblem(format)).toBeNull();
        const compiled = RE2JS.compile(pattern).re2Input;
        expect(compiled.onepass).toBeNull();
        let state = 7;
        const rows = Array.from({ length: 400 }, () => {
          let row = '';
          let previous = -1;
          for (let index = 0; index < 1_000; index += 1) {
            state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
            let letter = (state >>> 16) % letters.length;
            if (letter === previous) letter = (letter + 1) % letters.length;
            row += letters[letter];
            previous = letter;
          }
          return `${row}${letters[0]}${letters[0]}`;
        });
        expect(rows.every((row) => new RegExp(pattern, 'u').test(row))).toBe(true);
        const characters = testedCharacters();
        const started = performance.now();
        const settlement = settleJsonSchemaCompletion(JSON.stringify({ rows }), 'stop', format);
        expect(performance.now() - started).toBeLessThan(2_000);
        expect(settlement).toMatchObject(expensiveReply);
        expect(characters()).toBeLessThanOrEqual(5 * 1_002);
      }, 60_000);

      type Dfa = RE2JS['re2Input']['dfa'];

      function allocatedDfaBytes(): () => number {
        const prototype = Object.getPrototypeOf(
          RE2JS.compile('(?:a|b)*a(?:a|b){3}$').re2Input.dfa,
        ) as Dfa;
        let bytes = 0;
        const charge = <T>(dfa: Dfa, allocate: () => T): T => {
          const before = dfa.memBudget;
          const result = allocate();
          bytes += Math.max(0, before - dfa.memBudget);
          return result;
        };
        const { getState, allocTable } = prototype;
        vi.spyOn(prototype, 'getState').mockImplementation(function (
          this: Dfa,
          ...args: Parameters<Dfa['getState']>
        ) {
          return charge(this, () => getState.apply(this, args));
        });
        vi.spyOn(prototype, 'allocTable').mockImplementation(function (
          this: Dfa,
          ...args: Parameters<Dfa['allocTable']>
        ) {
          return charge(this, () => allocTable.apply(this, args));
        });
        return () => bytes;
      }

      function steppedInstructions(): () => number {
        const test = vi.spyOn(RE2JS.prototype, 'test');
        return () =>
          test.mock.calls.reduce(
            (total, [subject], call) =>
              total +
              (String(subject).length + 1) *
                Number((test.mock.contexts[call] as RE2JS).re2Input.numberOfInstructions()),
            0,
          );
      }

      it('charges a lazy DFA served from its cache only its own work at the edge of the budget', () => {
        const pattern = '[ab]+$|c{1,700}x';
        const format = rowsMatching(pattern);
        expect(jsonSchemaFormatProblem(format)).toBeNull();
        const compiled = RE2JS.compile(pattern).re2Input;
        expect(compiled.onepass).toBeNull();
        expect(compiled.prefilter).toBeNull();
        expect(1_061 * Number(compiled.numberOfInstructions())).toBeGreaterThan(1_400_000);
        const prototype = Object.getPrototypeOf(compiled.dfa) as Dfa;
        const { match } = prototype;
        let runs: Array<{ budget: number; answered: boolean }> = [];
        vi.spyOn(prototype, 'match').mockImplementation(function (
          this: Dfa,
          ...args: Parameters<Dfa['match']>
        ) {
          const budget = this.memBudget;
          const result: unknown = match.apply(this, args);
          runs.push({ budget, answered: result !== null });
          return result;
        });
        const fill = 7;
        const reply = (tuning: number) =>
          JSON.stringify({
            rows: [
              ...Array.from({ length: fill }, () => 'a'.repeat(1_000)),
              'a'.repeat(tuning),
              'a'.repeat(1_060),
              ...Array.from({ length: 20 }, () => 'a'.repeat(100)),
            ],
          });
        const settle = (content: string) => {
          runs = [];
          return settleJsonSchemaCompletion(content, 'stop', format);
        };
        expect(settle(reply(1)).ok).toBe(true);
        const slack = runs[fill + 1]!.budget;
        expect(slack % 4).toBe(0);
        const tuning = 1 + slack / 4;
        expect(tuning).toBeLessThan(1_000);
        const content = reply(tuning);
        expect(settle(content)).toMatchObject({ ok: true });
        expect(runs.slice(fill + 1)).toEqual(
          Array.from({ length: 21 }, () => ({ budget: 0, answered: true })),
        );
        expect(settle(reply(tuning + 1))).toMatchObject(expensiveReply);
      });

      it('bounds the engine work and transient heap one reply spends on wide character classes', () => {
        const format = formatFor(
          anyOfPatterns(
            Array.from({ length: 30 }, (_, index) => `(?:\\p{L}|z${index})*\\p{Lu}\\p{L}{12}$`),
          ),
        );
        expect(jsonSchemaFormatProblem(format)).toBeNull();
        const letters = ['a', 'A', 'é', 'Ж'];
        const value = `${mixedLetters(2_987, letters)}é${mixedLetters(12, letters)}`;
        expect(new RegExp('\\p{Lu}\\p{L}{12}$', 'u').test(value)).toBe(false);
        const dfaBytes = allocatedDfaBytes();
        const instructions = steppedInstructions();
        const original = RE2JS.compile;
        const matchers: RE2JS[] = [];
        vi.spyOn(RE2JS, 'compile').mockImplementation((...args) => {
          const matcher = original.apply(RE2JS, args);
          matchers.push(matcher);
          return matcher;
        });
        collectGarbage();
        const baseline = process.memoryUsage().heapUsed;
        const profiler = new GCProfiler();
        profiler.start();
        const started = performance.now();
        const settlement = settleJsonSchemaCompletion(JSON.stringify({ value }), 'stop', format);
        const elapsed = performance.now() - started;
        const settled = process.memoryUsage().heapUsed;
        const collections = profiler.stop().statistics;
        const peak = Math.max(
          settled,
          ...collections.map(({ beforeGC }) => beforeGC.heapStatistics.usedHeapSize),
        );
        expect(matchers).toHaveLength(30);
        expect(settlement).toMatchObject(expensiveReply);
        expect(dfaBytes()).toBeGreaterThan(4_000_000);
        expect(instructions() + dfaBytes() / 4).toBeLessThanOrEqual(1_500_000);
        expect(peak - baseline).toBeLessThan(50_000_000);
        expect(elapsed).toBeLessThan(2_000);
      }, 30_000);

      it.each([
        ['one pattern', ['[\\p{Ll}\\p{Lo}\\p{Mn}\\p{Po}]{1000}'.repeat(30)]],
        ['many patterns', Array.from({ length: 49 }, (_, index) => `\\p{L}{100}z${index}`)],
      ])(
        'refuses at admission %s whose classes make the matcher costly to build',
        (_name, patterns) => {
          expect(patterns.every((pattern) => pattern.length <= 1_024)).toBe(true);
          expect(jsonSchemaFormatProblem(formatFor(anyOfPatterns(patterns)))).toBe(
            'the schema patterns are too large to enforce together',
          );
        },
      );
    });

    describe('compiled patterns', () => {
      afterEach(() => {
        vi.restoreAllMocks();
      });

      const alphabet = 'abcdefghijklmnopqrstuvwxyz';

      it('keeps no program for a pattern refused as too large', () => {
        const compile = vi.spyOn(RE2JS, 'compile');
        const pattern = `(?:${alphabet}){1000}(?:${alphabet}){1000}refused`;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          expect(jsonSchemaFormatProblem(patternFormat(pattern))).toBe(
            'the schema patterns are too large to enforce together',
          );
        }
        expect(compile).toHaveBeenCalledTimes(3);
      });

      it('keeps no entry for a pattern RE2 refuses', () => {
        const compile = vi.spyOn(RE2JS, 'compile');
        for (let attempt = 0; attempt < 2; attempt += 1) {
          expect(jsonSchemaFormatProblem(patternFormat('^(?=cache)x$'))).toMatch(
            /unsupported pattern: lookahead/,
          );
        }
        expect(compile).not.toHaveBeenCalled();
        for (let attempt = 0; attempt < 2; attempt += 1) {
          expect(jsonSchemaFormatProblem(patternFormat('^x{1001}cache$'))).toMatch(
            /unsupported pattern: invalid repeat count/,
          );
        }
        expect(compile).toHaveBeenCalledTimes(2);
      });

      it('keeps no matcher or its match state once a settlement returns', async () => {
        const original = RE2JS.compile;
        const matchers: Array<WeakRef<RE2JS>> = [];
        const compile = vi.spyOn(RE2JS, 'compile').mockImplementation((...args) => {
          const matcher = original.apply(RE2JS, args);
          matchers.push(new WeakRef(matcher));
          return matcher;
        });
        const format = formatFor({
          type: 'object',
          properties: {
            value: {
              anyOf: Array.from({ length: 5 }, (_, index) => ({
                type: 'string',
                pattern: `(?:a|b|retained${index})*a(?:a|b){16}$`,
              })),
            },
          },
          required: ['value'],
        });
        const settlement = settleJsonSchemaCompletion(
          JSON.stringify({ value: `${'ab'.repeat(5_000)}b${'b'.repeat(16)}` }),
          'stop',
          format,
        );
        expect(settlement).toMatchObject({ ok: false, code: 'json_schema_not_satisfied' });
        expect(matchers).toHaveLength(5);
        compile.mockClear();
        compile.mockRestore();
        await new Promise((resolve) => setTimeout(resolve, 0));
        collectGarbage();
        expect(matchers.filter((matcher) => matcher.deref() !== undefined)).toHaveLength(0);
      });

      it('compiles each distinct pattern once per settlement', () => {
        const compile = vi.spyOn(RE2JS, 'compile');
        const format = formatFor({
          type: 'object',
          properties: {
            first: { type: 'string', pattern: '^shared-[a-z]+$' },
            second: { type: 'string', pattern: '^shared-[a-z]+$' },
            rows: { type: 'array', items: { type: 'string', pattern: '^row[0-9]$' } },
          },
        });
        const content = JSON.stringify({
          first: 'shared-a',
          second: 'shared-b',
          rows: ['row1', 'row2', 'row3'],
        });
        expect(settleJsonSchemaCompletion(content, 'stop', format)).toEqual({ ok: true, content });
        expect(compile).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('reply nesting', () => {
    const chain = (hops: number): Record<string, unknown> => {
      const definitions: Record<string, unknown> = {
        node: { type: 'object', properties: { next: { $ref: '#/$defs/hop1' } } },
      };
      for (let hop = 1; hop <= hops; hop += 1) {
        definitions[`hop${hop}`] = { $ref: `#/$defs/${hop === hops ? 'node' : `hop${hop + 1}`}` };
      }
      return {
        type: 'object',
        $defs: definitions,
        properties: { root: { $ref: '#/$defs/node' } },
        required: ['root'],
      };
    };

    const nested = (containers: number): string =>
      `{"root":${'{"next":'.repeat(containers - 2)}{}${'}'.repeat(containers - 1)}`;

    it('settles a reply nested to the limit through the longest admitted reference chain', () => {
      const format = formatFor(chain(9));
      expect(jsonSchemaFormatProblem(format)).toBeNull();
      expect(settleJsonSchemaCompletion(nested(60), 'stop', format)).toEqual({
        ok: true,
        content: nested(60),
      });
    });

    it.each([61, 5_000])(
      'fails closed instead of overflowing the stack on a reply nested %i levels deep',
      (containers) => {
        const format = formatFor(chain(9));
        expect(settleJsonSchemaCompletion(nested(containers), 'stop', format)).toMatchObject({
          ok: false,
          status: 502,
          code: 'json_schema_not_satisfied',
          message: expect.stringContaining('the reply nests deeper than 60 levels'),
        });
      },
    );

    it('refuses a reply nested too deeply to read back before parsing it', () => {
      const format = formatFor(chain(9));
      expect(settleJsonSchemaCompletion(nested(200_000), 'stop', format)).toMatchObject({
        ok: false,
        status: 502,
        code: 'json_schema_not_satisfied',
        message: expect.stringContaining('the reply nests deeper than 60 levels'),
      });
    });

    it('measures depth outside strings only', () => {
      const format = formatFor({ type: 'object' });
      const content = JSON.stringify({ text: '['.repeat(500), nested: [[[]]] });
      expect(settleJsonSchemaCompletion(content, 'stop', format)).toEqual({
        ok: true,
        content,
      });
    });

    it('counts array nesting too', () => {
      const format = formatFor({ type: 'object' });
      const content = `{"deep":${'['.repeat(60)}${']'.repeat(60)}}`;
      expect(settleJsonSchemaCompletion(content, 'stop', format)).toMatchObject({
        ok: false,
        code: 'json_schema_not_satisfied',
      });
    });
  });
});
