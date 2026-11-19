import { describe, expect, it } from 'vitest';

import { answerUiTemplateRefs, parseAnswerUiTemplate } from '../answer-ui';

function shape(template: string): string[] {
  return parseAnswerUiTemplate(template).map((part) =>
    part.kind === 'text'
      ? `text:${part.text}`
      : part.kind === 'ref'
        ? `ref:${part.id}`
        : `expression:${part.source}`,
  );
}

describe('answer UI template slots', () => {
  it('reads references, computed slots and the text around them', () => {
    expect(shape('Rent {rent}, left {= income - rent}.')).toEqual([
      'text:Rent ',
      'ref:rent',
      'text:, left ',
      'expression:income - rent',
      'text:.',
    ]);
  });

  it('ignores whitespace inside the braces and folds a reference to lower case', () => {
    expect(shape('{  Rent\t}')).toEqual(['ref:rent']);
    expect(shape('{\n=  a * 2  }')).toEqual(['expression:a * 2']);
    expect(shape('{= a}{ =b}')).toEqual(['expression:a', 'expression:b']);
  });

  it('keeps a slot that names no reference or expression as plain text', () => {
    expect(shape('{}')).toEqual(['text:{}']);
    expect(shape('{ }')).toEqual(['text:{ }']);
    expect(shape('{not a ref}')).toEqual(['text:{not a ref}']);
    expect(shape('{1a}')).toEqual(['text:{1a}']);
    expect(shape('{a')).toEqual(['text:{a']);
    expect(shape('a}')).toEqual(['text:a}']);
  });

  it('pairs a closing brace with the nearest opening brace before it', () => {
    expect(shape('{{a}}')).toEqual(['text:{', 'ref:a', 'text:}']);
    expect(shape('{a {b}')).toEqual(['text:{a ', 'ref:b']);
    expect(shape('{a}}{b}')).toEqual(['ref:a', 'text:}', 'ref:b']);
  });

  it('lists the references a template reads', () => {
    expect(answerUiTemplateRefs('{a} {= b + c} {d e}')).toEqual(['a', 'b', 'c']);
  });

  it.each([
    ['spaces after an opening brace', `{${' '.repeat(100_000)}`],
    ['doubled braces and spaces', `{{${' '.repeat(100_000)}`],
    ['repeated openers', '{ '.repeat(50_000)],
    ['repeated computed openers', '{= '.repeat(33_000)],
    ['spaces around an equals sign', `{${' '.repeat(50_000)}=${' '.repeat(50_000)}`],
    ['a long unclosed slot', `{a${' '.repeat(100_000)}`],
  ])('answers %s of 100000 characters in linear time', (_label, template) => {
    const started = performance.now();
    expect(parseAnswerUiTemplate(template)).toEqual([{ kind: 'text', text: template }]);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('reads a slot padded with 100000 spaces', () => {
    const padding = ' '.repeat(100_000);
    const started = performance.now();
    expect(shape(`{${padding}rent${padding}}`)).toEqual(['ref:rent']);
    expect(shape(`{${padding}=${padding}a${padding}}`)).toEqual(['expression:a']);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
