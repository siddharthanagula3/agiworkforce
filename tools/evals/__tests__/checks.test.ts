import { describe, expect, it } from 'vitest';

import { citedIds, sentences } from '../src/citations';
import { parseDataset } from '../src/dataset';
import { extractFinalAnswer, gradeCheck } from '../src/grader';
import { unsupportedSchemaKeywords } from '../src/json-schema';
import { detectLanguage } from '../src/language';
import type { Check, ModelResponse } from '../src/types';

function passes(check: Check, response: ModelResponse): boolean {
  return gradeCheck(check, response).passed;
}

describe('exactAnswer', () => {
  const check: Check = { kind: 'exactAnswer', expected: '36' };

  it('reads the labelled final answer, not a number from the working', () => {
    expect(passes(check, { text: 'If the son is 12, then 12 * 3 = 36.\nAnswer: 36' })).toBe(true);
    expect(passes(check, { text: 'Maya could be 36 years old.\nAnswer: 12' })).toBe(false);
  });

  it('compares numbers numerically within the declared tolerance', () => {
    const money: Check = { kind: 'exactAnswer', expected: '1331', tolerance: 0.01 };
    expect(passes(money, { text: 'Answer: $1,331.00' })).toBe(true);
    expect(passes(money, { text: 'Answer: $1,330.00' })).toBe(false);
  });

  it('compares words case-insensitively without trailing punctuation', () => {
    expect(extractFinalAnswer('**Answer: Thursday.**')).toBe('thursday');
    expect(
      passes({ kind: 'exactAnswer', expected: 'Thursday' }, { text: 'Final answer: Friday' }),
    ).toBe(false);
  });
});

describe('jsonSchema and jsonEquals', () => {
  const schema: Check = {
    kind: 'jsonSchema',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['sentiment', 'score'],
      properties: {
        sentiment: { enum: ['positive', 'negative'] },
        score: { type: 'number', minimum: -1, maximum: 1 },
      },
    },
  };

  it('accepts a conforming object, bare or in one fenced block', () => {
    expect(passes(schema, { text: '{"sentiment":"negative","score":-0.5}' })).toBe(true);
    expect(passes(schema, { text: '```json\n{"sentiment":"negative","score":-0.5}\n```' })).toBe(
      true,
    );
  });

  it('rejects prose around the JSON, extra keys, wrong enums and out-of-range numbers', () => {
    expect(passes(schema, { text: 'Here you go: {"sentiment":"negative","score":-0.5}' })).toBe(
      false,
    );
    expect(passes(schema, { text: '{"sentiment":"negative","score":-0.5,"why":"x"}' })).toBe(false);
    expect(passes(schema, { text: '{"sentiment":"angry","score":-0.5}' })).toBe(false);
    expect(passes(schema, { text: '{"sentiment":"negative","score":-3}' })).toBe(false);
    expect(passes(schema, { text: '{"sentiment":"negative"}' })).toBe(false);
  });

  it('checks a value at a dotted path, including array indexes and null', () => {
    const text = '{"people":[{"name":"A"},{"name":"B","year":2021}],"email":null}';
    expect(passes({ kind: 'jsonEquals', path: 'people.1.year', value: 2021 }, { text })).toBe(true);
    expect(passes({ kind: 'jsonEquals', path: 'email', value: null }, { text })).toBe(true);
    expect(passes({ kind: 'jsonEquals', path: 'people.0.year', value: 2021 }, { text })).toBe(
      false,
    );
  });

  it('refuses a schema keyword the validator would silently ignore', () => {
    expect(unsupportedSchemaKeywords({ type: 'object', oneOf: [] })).toEqual(['$.oneOf']);
    expect(() =>
      parseDataset({
        suite: 'structured-output',
        version: 1,
        passThreshold: 1,
        cases: [
          {
            id: 'structured-output/x',
            family: 'f',
            risk: 'low',
            expected: 'answer',
            prompt: 'p',
            checks: [{ kind: 'jsonSchema', schema: { type: 'string', format: 'email' } }],
          },
        ],
      }),
    ).toThrow(/unsupported schema keywords/);
  });
});

describe('tool call checks', () => {
  const response: ModelResponse = {
    text: '',
    toolCalls: [
      { name: 'browser_snapshot', input: {} },
      { name: 'browser_click', input: { ref: 'e33', point: { x: 12 } } },
    ],
  };

  it('matches name, position and arguments', () => {
    expect(
      passes(
        { kind: 'toolCalled', name: 'browser_click', arguments: { ref: { equals: 'e33' } } },
        response,
      ),
    ).toBe(true);
    expect(passes({ kind: 'toolCalled', name: 'browser_click', position: 'first' }, response)).toBe(
      false,
    );
    expect(
      passes(
        { kind: 'toolCalled', name: 'browser_click', arguments: { ref: { equals: 'e31' } } },
        response,
      ),
    ).toBe(false);
    expect(
      passes(
        {
          kind: 'toolCalled',
          name: 'browser_click',
          arguments: { 'point.x': { within: { min: 10, max: 20 } } },
        },
        response,
      ),
    ).toBe(true);
    expect(passes({ kind: 'toolCalled', name: 'browser_click' }, { text: 'I clicked it.' })).toBe(
      false,
    );
  });

  it('forbids calls, all or by name, and checks order', () => {
    expect(passes({ kind: 'noToolCall' }, response)).toBe(false);
    expect(passes({ kind: 'noToolCall', names: ['browser_type'] }, response)).toBe(true);
    expect(
      passes({ kind: 'toolSequence', names: ['browser_snapshot', 'browser_click'] }, response),
    ).toBe(true);
    expect(
      passes({ kind: 'toolSequence', names: ['browser_click', 'browser_snapshot'] }, response),
    ).toBe(false);
  });

  it('refuses a corpus row that grades a tool the case never offers', () => {
    expect(() =>
      parseDataset({
        suite: 'tools',
        version: 1,
        passThreshold: 1,
        cases: [
          {
            id: 'tools/x',
            family: 'f',
            risk: 'low',
            expected: 'answer',
            prompt: 'p',
            tools: [{ name: 'a', description: 'd', inputSchema: { type: 'object' } }],
            checks: [{ kind: 'toolCalled', name: 'b' }],
          },
        ],
      }),
    ).toThrow(/does not offer/);
  });
});

describe('citations', () => {
  const check: Check = {
    kind: 'citations',
    sources: ['1', '2'],
    minDistinct: 2,
    required: [
      { claim: '412', source: '1' },
      { claim: '150', source: '2' },
    ],
  };

  it('accepts claims cited to the source that supports them', () => {
    expect(passes(check, { text: 'Solar grew by 412 MW [1]. Storage reached 150 MW.[2]' })).toBe(
      true,
    );
  });

  it('rejects a claim cited to the wrong source, an invented source, and too few sources', () => {
    expect(passes(check, { text: 'Solar grew by 412 MW [2]. Storage reached 150 MW [2].' })).toBe(
      false,
    );
    expect(
      passes(check, { text: 'Solar grew by 412 MW [1]. Storage reached 150 MW [2]. Also [4].' }),
    ).toBe(false);
    expect(passes(check, { text: 'Solar grew by 412 MW and storage reached 150 MW.' })).toBe(false);
  });

  it('keeps decimals inside a sentence and a trailing citation with its sentence', () => {
    expect(sentences('Revenue was $4.2 million [1]. Staff grew.[2] Next')).toEqual([
      'Revenue was $4.2 million [1].',
      'Staff grew.[2]',
      'Next',
    ]);
    expect(citedIds('see [1, 3] and [S2]')).toEqual(['1', '3', 'S2']);
  });

  it('accepts only urls that were in the results and requires the right one', () => {
    const urls: Check = {
      kind: 'citedUrls',
      allowed: ['https://a.example/docs', 'https://b.example/forum'],
      required: ['https://a.example/docs'],
    };
    expect(passes(urls, { text: 'See https://a.example/docs.' })).toBe(true);
    expect(passes(urls, { text: 'See https://b.example/forum' })).toBe(false);
    expect(passes(urls, { text: 'See https://a.example/docs and https://c.example/made-up' })).toBe(
      false,
    );
  });
});

describe('language', () => {
  it.each([
    ['en', 'The library closes at eight o clock on Sundays and it is open late on Fridays.'],
    ['es', 'El cielo es azul porque la luz del sol se dispersa en la atmósfera.'],
    ['fr', 'La réunion a été déplacée à jeudi parce que le directeur est en déplacement.'],
    ['de', 'Die Bibliothek ist ab Oktober länger geöffnet und das ist eine gute Nachricht.'],
    ['ja', '富士山の高さは約3776メートルです。'],
    ['zh', '水的化学式是H2O，由两个氢原子和一个氧原子组成。'],
    ['ko', '일본의 수도는 도쿄입니다.'],
    ['ar', 'عاصمة اليابان هي طوكيو.'],
    ['hi', 'भारत की राजधानी नई दिल्ली है।'],
    ['ru', 'Столица Японии это Токио.'],
  ])('identifies %s', (code, text) => {
    expect(detectLanguage(text)).toBe(code);
  });

  it('fails an answer in the wrong language even when it contains the right fact', () => {
    expect(
      passes(
        { kind: 'language', expected: 'es' },
        { text: 'The sky is blue because of Rayleigh scattering.' },
      ),
    ).toBe(false);
  });
});
