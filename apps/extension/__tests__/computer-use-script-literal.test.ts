import { describe, expect, it } from 'vitest';
import { toScriptLiteral } from '../src/features/computer-use/scriptLiteral';

const LINE_SEPARATORS = String.fromCharCode(0x2028, 0x2029);

const evaluateLiteral = (literal: string): unknown => (0, eval)(`(${literal})`);

describe('toScriptLiteral', () => {
  const values: unknown[] = [
    'https://example.com/a?b="c"&d=\'e\'',
    'back\\slash \\" \\u003c',
    '</script><script>alert(1)</script>',
    '<!-- --> <img onerror=alert(1)>',
    `before${LINE_SEPARATORS}after`,
    'html > body:nth-of-type(1) > main:nth-of-type(1)',
    { selector: '</script>', signature: `a|b${LINE_SEPARATORS}`, nested: ['<', '>', null, 3] },
    null,
    42,
    true,
  ];

  it.each(values)('round-trips %j unchanged', (value) => {
    expect(evaluateLiteral(toScriptLiteral(value))).toEqual(value);
  });

  it('leaves no markup or line-separator characters in the emitted source', () => {
    const literal = toScriptLiteral(`</script>${LINE_SEPARATORS}<b>`);
    expect(literal).not.toMatch(/[<>\u2028\u2029]/u);
    expect(literal).toBe('"\\u003c/script\\u003e\\u2028\\u2029\\u003cb\\u003e"');
  });

  it('emits undefined for a value JSON cannot represent', () => {
    expect(toScriptLiteral(undefined)).toBe('undefined');
    expect(evaluateLiteral(toScriptLiteral(undefined))).toBeUndefined();
  });
});
