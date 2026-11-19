import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';

import {
  createCitationMarkupFilter,
  stripCitationMarkup,
  withoutCitationMarkup,
} from '../citation-markup';

const SINGLE_REFERENCE = 'citeturn620734view2';
const TWO_REFERENCES = 'citeturn6search0turn6view2';

describe('createCitationMarkupFilter', () => {
  it('drops a whole citation span', () => {
    const filter = createCitationMarkupFilter();
    expect(filter.push(`Starship flew again. ${TWO_REFERENCES}`) + filter.flush()).toBe(
      'Starship flew again. ',
    );
  });

  it('holds a span split across pushes until it closes', () => {
    const filter = createCitationMarkupFilter();
    expect(filter.push('Mars flybys. ')).toBe('Mars flybys. ');
    expect(filter.push(SINGLE_REFERENCE.slice(0, 4))).toBe('');
    expect(filter.push(`${SINGLE_REFERENCE.slice(4)} Done.`)).toBe(' Done.');
  });

  it('ends an unclosed span at a line break and keeps the next line', () => {
    const filter = createCitationMarkupFilter();
    expect(filter.push('Done.citeturn6search0\n\nNext step.')).toBe('Done.\n\nNext step.');
  });

  it('drops stray markup characters outside a span', () => {
    const filter = createCitationMarkupFilter();
    expect(filter.push('ABC')).toBe('ABC');
  });

  it('releases an open span that grows past the bound as text without the markup characters', () => {
    const filter = createCitationMarkupFilter();
    const long = 'x'.repeat(600);
    expect(filter.push(`${long}`)).toBe(long);
  });

  it('drops a truncated citation at the end and releases any other open span as text', () => {
    const truncated = createCitationMarkupFilter();
    expect(truncated.push('Launch is set. citeturn6sea')).toBe('Launch is set. ');
    expect(truncated.flush()).toBe('');

    const stray = createCitationMarkupFilter();
    expect(stray.push('First part. And the last sentence.')).toBe(
      'First part. And the last sentence.',
    );
    expect(stray.flush()).toBe('');
  });
});

describe('stripCitationMarkup', () => {
  it('applies the stream rule to stored text', () => {
    expect(stripCitationMarkup(`Starship flew again. ${SINGLE_REFERENCE}\n\nNext.`)).toBe(
      'Starship flew again. \n\nNext.',
    );
    expect(stripCitationMarkup('Done.citeturn6search0\n\nNext step.')).toBe(
      'Done.\n\nNext step.',
    );
    expect(stripCitationMarkup('ABC')).toBe('ABC');
    expect(stripCitationMarkup('Ends here.citeturn6')).toBe('Ends here.');
    expect(stripCitationMarkup('Please cite turn 6 of the report.')).toBe(
      'Please cite turn 6 of the report.',
    );
  });

  it('keeps the text between a stray open marker and a later close on the same line', () => {
    const between = 'a long sentence of ordinary answer text '.repeat(20);
    const stored = `\uE200${between}\uE201 and more.`;

    const stripped = stripCitationMarkup(stored);

    expect(stripped).toContain('a long sentence of ordinary answer text');
    expect(stripped.endsWith(' and more.')).toBe(true);
    expect(stripped).not.toMatch(/[\uE200-\uE204]/);
  });

  it('keeps the text after a stray open marker when no close ends the line within the bound', () => {
    const between = 'ordinary answer text '.repeat(60);
    const stripped = stripCitationMarkup(`\uE200${between}\nNext line.`);

    expect(stripped).toContain('ordinary answer text');
    expect(stripped.endsWith('\nNext line.')).toBe(true);
  });

  it('gives the same text for a stored answer as for the same answer streamed in small deltas', () => {
    const between = 'a long sentence of ordinary answer text '.repeat(20);
    const stored = `Start. \uE200${between}\uE201 and more.`;
    const filter = createCitationMarkupFilter();
    let streamed = '';
    for (let index = 0; index < stored.length; index += 7) {
      streamed += filter.push(stored.slice(index, index + 7));
    }
    streamed += filter.flush();

    expect(stripCitationMarkup(stored)).toBe(streamed);
  });
});

describe('cleaning removes only citation markup', () => {
  function streamedInDeltas(text: string, size: number): string {
    const filter = createCitationMarkupFilter();
    let out = '';
    for (let index = 0; index < text.length; index += size) {
      out += filter.push(text.slice(index, index + size));
    }
    return out + filter.flush();
  }

  const cases: Array<[label: string, stored: string, cleaned: string]> = [
    [
      'a stray marker mid-line',
      'Use the glyph \uE200 before the path and keep going.\nNext line.',
      'Use the glyph  before the path and keep going.\nNext line.',
    ],
    [
      'a stray marker at the end of a line',
      'The line ends with a marker \uE200\nThe next line stays.',
      'The line ends with a marker \nThe next line stays.',
    ],
    [
      'a stray marker inside a code fence',
      '```toml\nformat = "\uE200 $directory"\nsymbol = "x"\n```\nAfter the fence.',
      '```toml\nformat = " $directory"\nsymbol = "x"\n```\nAfter the fence.',
    ],
    [
      'an unclosed citation followed by more words',
      'end \uE200cite\uE202turn0search0 trailing words never closed',
      'end  trailing words never closed',
    ],
    [
      'a well-formed span of another kind',
      'See the list.\uE200navlist\uE202Latest launches\uE202turn0news1\uE201 Then more.',
      'See the list. Then more.',
    ],
    [
      'a citation between two stray markers',
      'A \uE200 b \uE200cite\uE202turn1search2\uE201 c \uE200 d',
      'A  b  c  d',
    ],
    [
      'a closed citation whose reference holds a hyphen',
      'a \uE200cite\uE202turn0file0-L5\uE201 b',
      'a  b',
    ],
    [
      'a closed citation with a hyphenated reference among others',
      'x \uE200cite\uE202turn0file0-L5\uE202turn0file1\uE201 y',
      'x  y',
    ],
    [
      'an unclosed citation with a hyphenated reference followed by words',
      'a \uE200cite\uE202turn0file0-L5 then words\uE201 later',
      'a -L5 then words later',
    ],
  ];

  it.each(cases)('keeps the text around %s', (_label, stored, cleaned) => {
    expect(stripCitationMarkup(stored)).toBe(cleaned);
  });

  it.each(cases)('gives the same text for %s streamed in any delta size', (_label, stored) => {
    const expected = stripCitationMarkup(stored);
    for (const size of [1, 2, 3, 5, 8, stored.length]) {
      expect(streamedInDeltas(stored, size)).toBe(expected);
    }
  });

  const LARGE_LENGTH = 200_000;
  const largeInputs: Array<[label: string, stored: string, cleaned: string]> = [
    [
      'open, kind and separator repeated',
      '\uE200a\uE202'.repeat(LARGE_LENGTH / 4),
      'a'.repeat(LARGE_LENGTH / 4),
    ],
    [
      'one citation header before a long reference',
      `\uE200cite\uE202${'a'.repeat(LARGE_LENGTH)}`,
      'cite' + 'a'.repeat(LARGE_LENGTH),
    ],
    [
      'hyphenated citation headers repeated',
      '\uE200cite\uE202t-'.repeat(LARGE_LENGTH / 8),
      '-'.repeat(LARGE_LENGTH / 8),
    ],
    [
      'line breaks after one open marker',
      `\uE200${'\n'.repeat(LARGE_LENGTH)}`,
      '\n'.repeat(LARGE_LENGTH),
    ],
  ];

  it.each(largeInputs)('cleans %s in linear time', (_label, stored, cleaned) => {
    const startedAt = performance.now();
    const stripped = stripCitationMarkup(stored);
    const streamed = streamedInDeltas(stored, 997);
    expect(performance.now() - startedAt).toBeLessThan(1000);
    expect(stripped).toBe(cleaned);
    expect(streamed).toBe(stripped);
  });
});

describe('withoutCitationMarkup', () => {
  async function collect(chunks: StreamChunk[]): Promise<StreamChunk[]> {
    async function* source() {
      yield* chunks;
    }
    const out: StreamChunk[] = [];
    for await (const chunk of withoutCitationMarkup(source())) out.push(chunk);
    return out;
  }

  it('removes a span split across text deltas and keeps the other chunks in order', async () => {
    const out = await collect([
      { type: 'text-delta', delta: 'Starship flew again. ' },
      { type: 'text-delta', delta: SINGLE_REFERENCE.slice(0, 4) },
      { type: 'text-delta', delta: `${SINGLE_REFERENCE.slice(4)} Next.` },
      { type: 'stop', reason: 'end_turn' },
    ] as StreamChunk[]);
    expect(out.map((chunk) => chunk.type)).toEqual(['text-delta', 'text-delta', 'stop']);
    expect(out.map((chunk) => (chunk.type === 'text-delta' ? chunk.delta : '')).join('')).toBe(
      'Starship flew again.  Next.',
    );
  });

  it('releases held text before the stop chunk', async () => {
    const out = await collect([
      { type: 'text-delta', delta: 'Done. note' },
      { type: 'stop', reason: 'end_turn' },
    ] as StreamChunk[]);
    expect(out.at(-1)?.type).toBe('stop');
    expect(out.map((chunk) => (chunk.type === 'text-delta' ? chunk.delta : '')).join('')).toBe(
      'Done. note',
    );
  });
});
