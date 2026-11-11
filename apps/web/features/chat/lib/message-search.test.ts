import { describe, expect, it } from 'vitest';
import { matchingGroupIndexes, type RenderedTextCache } from './message-search';

function group(...contents: unknown[]) {
  return { messages: contents.map((content) => ({ content })) };
}

describe('the conversation rows a Find query reaches', () => {
  it('finds a phrase that crosses inline formatting, as the highlighter paints it', () => {
    const groups = [
      group('alpha **beta**'),
      group('alpha *beta*'),
      group('alpha beta'),
      group('x'),
    ];
    expect(matchingGroupIndexes(groups, 'alpha beta', new Map())).toEqual([0, 1, 2]);
  });

  it('does not match Markdown syntax the reader never sees', () => {
    expect(matchingGroupIndexes([group('alpha **beta**')], 'beta**', new Map())).toEqual([]);
    expect(
      matchingGroupIndexes([group('see [docs](https://x.test)')], 'x.test', new Map()),
    ).toEqual([]);
  });

  it('keeps literal asterisks that are code', () => {
    const groups = [group('```\na * b\n```'), group('use `a * b` here')];
    expect(matchingGroupIndexes(groups, 'a * b', new Map())).toEqual([0, 1]);
  });

  it('keeps separate paragraphs apart and ignores case and padding', () => {
    expect(matchingGroupIndexes([group('alpha\n\nbeta')], 'alpha beta', new Map())).toEqual([]);
    expect(matchingGroupIndexes([group('Alpha **BETA**')], '  alpha beta ', new Map())).toEqual([
      0,
    ]);
  });

  it('matches a group when any of its messages matches, and skips non-text content', () => {
    expect(matchingGroupIndexes([group(undefined, 'a **b**')], 'a b', new Map())).toEqual([0]);
    expect(matchingGroupIndexes([group(undefined)], 'a', new Map())).toEqual([]);
    expect(matchingGroupIndexes([group('a')], '   ', new Map())).toEqual([]);
  });

  it('keeps only the text of messages still in the conversation', () => {
    const cache: RenderedTextCache = new Map();
    matchingGroupIndexes([group('one'), group('two')], 'o', cache);
    expect([...cache.keys()]).toEqual(['one', 'two']);
    matchingGroupIndexes([group('two')], 'o', cache);
    expect([...cache.keys()]).toEqual(['two']);
  });
});
