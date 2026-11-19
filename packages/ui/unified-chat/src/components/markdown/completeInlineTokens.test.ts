import { describe, it, expect } from 'vitest';

import { completeInlineTokens, dropOpenLinkDestination } from './completeInlineTokens';
import { MARKDOWN_STREAM_CORPUS, lines } from './__fixtures__/markdownStreamCorpus';

describe('completeInlineTokens, closes what the tail has left open', () => {
  const OPEN_CASES: ReadonlyArray<{
    readonly name: string;
    readonly tail: string;
    readonly repaired: string;
  }> = [
    { name: 'unterminated strong', tail: 'A **bold clai', repaired: 'A **bold clai**' },
    {
      name: 'strong opened with nothing after it yet',
      tail: 'Siddhartha, **',
      repaired: 'Siddhartha, ',
    },
    { name: 'strong opened at the end of a line', tail: 'Intro\n**  ', repaired: 'Intro\n' },
    { name: 'unterminated inline code', tail: 'Call `render', repaired: 'Call `render`' },
    {
      name: 'unterminated double-backtick span',
      tail: 'Escaped ``a ` b',
      repaired: 'Escaped ``a ` b``',
    },
    {
      name: 'unterminated link destination shows the label alone',
      tail: 'See [the spec](https://example.com/sp',
      repaired: 'See the spec',
    },
    {
      name: 'link destination not yet started',
      tail: 'See [the spec](',
      repaired: 'See the spec',
    },
    {
      name: 'strong opened before an unterminated code span',
      tail: 'A **bold `cal',
      repaired: 'A **bold `cal`**',
    },
    {
      name: 'link before an unterminated code span keeps its closing',
      tail: 'See [x](https://exa `cal',
      repaired: 'See [x](https://exa `cal`)',
    },
    {
      name: 'link destination broken across lines keeps its closing',
      tail: 'See [x](https://exa\nmore',
      repaired: 'See [x](https://exa\nmore)',
    },
    {
      name: 'an earlier finished link stays a link',
      tail: 'Read [a](https://a.example) then [b](https://b.exa',
      repaired: 'Read [a](https://a.example) then b',
    },
    {
      name: 'strong opened before an unterminated link',
      tail: 'A **bold [spec](https://exa',
      repaired: 'A **bold spec**',
    },
  ];

  it.each(OPEN_CASES)('$name', ({ tail, repaired }) => {
    expect(completeInlineTokens(tail)).toBe(repaired);
  });
});

describe('completeInlineTokens, leaves finished markdown alone', () => {
  const UNTOUCHED_CASES: ReadonlyArray<{ readonly name: string; readonly tail: string }> = [
    { name: 'balanced strong', tail: 'A **bold claim** stands.' },
    { name: 'bold italic', tail: 'A ***very bold*** claim.' },
    { name: 'balanced inline code', tail: 'Call `render` twice.' },
    { name: 'complete link', tail: 'See [the spec](https://example.com/spec).' },
    { name: 'complete image', tail: '![alt](https://example.com/a.png)' },
    { name: 'thematic break before prose', tail: lines('***', '', 'Below.') },
    { name: 'list bullets', tail: lines('* one', '* two') },
    { name: 'partial image destination stays literal', tail: '![alt](https://exa' },
    { name: 'markers inside a closed fence', tail: lines('```md', '**not bold', '`open', '```') },
    { name: 'markers inside an open fence', tail: lines('```md', '**not bold', '`open') },
    { name: 'markers inside a tilde fence', tail: lines('~~~md', '**not bold', '~~~') },
    {
      name: 'markers inside a nested fence',
      tail: lines('````md', '```js', 'const a = `x`;', '```', '````'),
    },
    { name: 'link destination containing parentheses', tail: 'See [x](https://example.com/a(b)).' },
    { name: 'reference link', tail: 'See [the spec][spec].' },
    { name: 'link definition', tail: '[spec]: https://example.com/spec' },
  ];

  it.each(UNTOUCHED_CASES)('$name', ({ tail }) => {
    expect(completeInlineTokens(tail)).toBe(tail);
  });

  it.each(MARKDOWN_STREAM_CORPUS)('$name is already complete', ({ source }) => {
    expect(completeInlineTokens(source)).toBe(source);
  });
});

describe('dropOpenLinkDestination, for an answer that stopped mid-link', () => {
  it('shows the cut-off link as its label', () => {
    expect(dropOpenLinkDestination('See [the spec](https://example.com/sp')).toBe('See the spec');
  });

  it('leaves everything else as written', () => {
    expect(dropOpenLinkDestination('A **bold `cal')).toBe('A **bold `cal');
    expect(dropOpenLinkDestination('See [x](https://example.com/x).')).toBe(
      'See [x](https://example.com/x).',
    );
    expect(dropOpenLinkDestination('![alt](https://exa')).toBe('![alt](https://exa');
    expect(dropOpenLinkDestination(lines('```md', '[a](https://exa'))).toBe(
      lines('```md', '[a](https://exa'),
    );
  });
});
