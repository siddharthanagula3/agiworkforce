import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { extractJsonObject, settleJsonObjectCompletion, wantsJsonObject } from './json-object-mode';

describe('wantsJsonObject', () => {
  it('is true only for json_object', () => {
    expect(wantsJsonObject({ type: 'json_object' })).toBe(true);
    expect(wantsJsonObject({ type: 'text' })).toBe(false);
    expect(wantsJsonObject({ type: 'json_schema' })).toBe(false);
    expect(wantsJsonObject(undefined)).toBe(false);
    expect(wantsJsonObject({})).toBe(false);
  });
});

describe('extractJsonObject, accepts', () => {
  it('a bare object', () => {
    const result = extractJsonObject('{"a":1}');

    expect(result.ok).toBe(true);
    expect(result.content).toBe('{"a":1}');
  });

  it('an object inside a json code fence', () => {
    const result = extractJsonObject('```json\n{"a": 1}\n```');

    expect(result.ok).toBe(true);
    expect(result.content).toBe('{"a":1}');
  });

  it('an object inside an unlabelled fence', () => {
    expect(extractJsonObject('```\n{"a": 1}\n```').content).toBe('{"a":1}');
  });

  it('an object wrapped in prose', () => {
    const result = extractJsonObject('Sure! Here you go:\n{"a": 1}\nHope that helps.');

    expect(result.ok).toBe(true);
    expect(result.content).toBe('{"a":1}');
  });

  it('a nested object with braces inside strings', () => {
    const raw = '{"note":"use { and } carefully","inner":{"b":2}}';

    expect(extractJsonObject(raw).content).toBe(raw);
  });

  it('an empty object', () => {
    expect(extractJsonObject('{}')).toEqual({ ok: true, content: '{}' });
  });
});

describe('extractJsonObject, rejects', () => {
  it('prose with no JSON at all', () => {
    const result = extractJsonObject('I cannot do that.');

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/did not return valid JSON/);
  });

  it('an empty completion', () => {
    expect(extractJsonObject('   ').ok).toBe(false);
  });

  it('a JSON array', () => {
    const result = extractJsonObject('[1, 2, 3]');

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not an object/);
  });

  it('a bare JSON scalar', () => {
    expect(extractJsonObject('42').ok).toBe(false);
    expect(extractJsonObject('"hello"').ok).toBe(false);
    expect(extractJsonObject('null').ok).toBe(false);
  });

  it('malformed JSON rather than repairing it', () => {
    const result = extractJsonObject('{"a": 1');

    expect(result.ok).toBe(false);
    expect(result.content).toBeUndefined();
  });

  it('two objects concatenated', () => {
    expect(extractJsonObject('{"a":1}\n{"b":2}').ok).toBe(false);
  });
});

describe('settleJsonObjectCompletion', () => {
  it('passes a complete object through whatever the stop reason', () => {
    expect(settleJsonObjectCompletion('{"a":1}', 'stop')).toEqual({ ok: true, content: '{"a":1}' });
    expect(settleJsonObjectCompletion('{"a":1}', 'length')).toEqual({
      ok: true,
      content: '{"a":1}',
    });
  });

  it('names a blocked stop as a refusal before looking at the text', () => {
    for (const finishReason of ['refusal', 'content_filter']) {
      expect(settleJsonObjectCompletion('{"a":1}', finishReason)).toMatchObject({
        ok: false,
        state: 'refused',
        code: 'json_object_refused',
      });
    }
  });

  it('names unparseable output at the output cap as incomplete', () => {
    for (const finishReason of ['length', 'max_tokens']) {
      expect(settleJsonObjectCompletion('{"a": [1, 2', finishReason)).toMatchObject({
        ok: false,
        state: 'incomplete',
        code: 'json_object_incomplete',
      });
    }
  });

  it('names unparseable output from a finished or unknown turn as invalid', () => {
    for (const finishReason of ['stop', null]) {
      expect(settleJsonObjectCompletion('no json here', finishReason)).toMatchObject({
        ok: false,
        state: 'invalid',
        code: 'json_object_not_satisfied',
      });
    }
  });
});
