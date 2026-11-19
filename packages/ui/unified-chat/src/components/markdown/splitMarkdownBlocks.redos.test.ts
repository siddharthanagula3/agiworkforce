import { describe, expect, it } from 'vitest';

import { createMarkdownBlockSplitter, htmlTagTokens } from './splitMarkdownBlocks';

const HOSTILE_BUDGET_MS = 2000;

const REFERENCE_TOKEN = new RegExp(
  [/\x3c!--[\s\S]*?-->/, /<!(?!--)[^>]*>/, /<(\/)?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/)?>/]
    .map((pattern) => pattern.source)
    .join('|'),
  'g',
);

function referenceTags(source: string) {
  const tags = [];
  for (const [, closing, name, selfClosing] of source.matchAll(REFERENCE_TOKEN)) {
    if (name) tags.push({ closing: Boolean(closing), name, selfClosing: Boolean(selfClosing) });
  }
  return tags;
}

function scannedTags(source: string) {
  return htmlTagTokens(source);
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe('htmlTagTokens', () => {
  it('finds the same tags as the pattern it replaced on random markup', () => {
    const pieces = [
      '<',
      '>',
      '!',
      '--',
      '/',
      'a',
      'br',
      'div',
      '-',
      ' ',
      '\n',
      '"',
      '=',
      'x1',
      '<!--',
      '-->',
      '</',
      '/>',
    ];
    const random = seededRandom(7);
    for (let round = 0; round < 4000; round += 1) {
      let source = '';
      const length = 1 + Math.floor(random() * 18);
      for (let piece = 0; piece < length; piece += 1) {
        source += pieces[Math.floor(random() * pieces.length)];
      }
      expect(scannedTags(source), JSON.stringify(source)).toEqual(referenceTags(source));
    }
  });

  it.each([
    '<>',
    'ab<>cd<p>',
    '<',
    'a <',
    '< p>x',
    '<p',
    '<><>',
    'x <> <b>y</b> <',
    '<!>',
    '<!-->',
    '<!--',
  ])('finds the same tags as the pattern it replaced in %j', (source) => {
    expect(scannedTags(source)).toEqual(referenceTags(source));
  });

  it('reads comments, doctypes, void, self-closing and nested tags like the pattern did', () => {
    const source =
      '<!-- <b> --><!DOCTYPE html><div class="a"><br><img src=x /><Span data-x="1">t</Span></div><a-b/>';
    expect(scannedTags(source)).toEqual(referenceTags(source));
    expect(scannedTags(source).map((tag) => tag.name)).toEqual([
      'div',
      'br',
      'img',
      'Span',
      'Span',
      'div',
      'a-b',
    ]);
  });
});

describe('markdown block splitting on a hostile reply', () => {
  it.each([
    ['unterminated comment openers', `<div>\n${'<!--'.repeat(110_000)}`],
    ['unterminated tag openers', `<div>\n${'<a'.repeat(130_000)}`],
    ['unterminated doctype openers', `<div>\n${'<!x'.repeat(80_000)}`],
  ])('tokenizes %s in linear time', (_label, source) => {
    const started = performance.now();
    htmlTagTokens(source);
    expect(performance.now() - started).toBeLessThan(HOSTILE_BUDGET_MS);
  });

  it('splits a streamed reply that holds an unclosed raw element', () => {
    const splitter = createMarkdownBlockSplitter();
    const started = performance.now();
    const split = splitter.update(`<div>\n${'<a'.repeat(130_000)}\n\nb\n\nc\n\nd\n\ne`);
    expect(performance.now() - started).toBeLessThan(HOSTILE_BUDGET_MS);
    expect(split.settled.length + (split.tail ? 1 : 0)).toBeGreaterThan(0);
  });
});
