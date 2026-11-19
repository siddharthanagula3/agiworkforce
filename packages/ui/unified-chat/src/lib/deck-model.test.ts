import { describe, expect, it } from 'vitest';

import {
  SLIDE_SEPARATOR,
  insertSlide,
  joinEditedSlide,
  moveSlide,
  NEW_SLIDE_MARKDOWN,
  parseDeck,
  removeSlide,
  replaceSlide,
  replaceVisualBlock,
  serializeDeck,
  slideSegments,
  slideTitle,
  splitSlideForEditing,
} from './deck-model';

const DECK = '# Title\n\nIntro\n\n---\n\n## Second\n\n- a\n- b\n\n---\n\n## Third\n\nEnd';

describe('deck model', () => {
  it('round-trips slides and the deck meta line', () => {
    const deck = parseDeck(DECK);
    expect(deck.slides).toHaveLength(3);
    const saved = serializeDeck({ ...deck, meta: { theme: 'midnight' } });
    expect(saved.startsWith('<!-- deck theme=midnight -->\n\n# Title')).toBe(true);
    expect(saved).toContain(`Intro${SLIDE_SEPARATOR}## Second`);
    expect(parseDeck(saved)).toEqual({ meta: { theme: 'midnight' }, slides: deck.slides });
  });

  it('keeps a bare deck line when the deck has no settings', () => {
    expect(serializeDeck({ meta: {}, slides: ['# A'] })).toBe('<!-- deck -->\n\n# A\n');
    expect(serializeDeck({ meta: { theme: '' }, slides: ['# A'] })).toBe('<!-- deck -->\n\n# A\n');
    expect(parseDeck(serializeDeck({ meta: {}, slides: ['# A', '# B'] }))).toEqual({
      meta: {},
      slides: ['# A', '# B'],
    });
  });

  it('offers a starter slide to insert', () => {
    expect(insertSlide({ meta: {}, slides: ['# A'] }, 0, NEW_SLIDE_MARKDOWN).slides).toEqual([
      '# A',
      '## New slide\n\n- First point\n- Second point',
    ]);
  });

  it('quotes meta values that hold spaces', () => {
    const content = serializeDeck({
      meta: { theme: 'custom', name: 'Acme Corp' },
      slides: ['# A'],
    });
    expect(parseDeck(content).meta['name']).toBe('Acme Corp');
  });

  it('adds, replaces, moves and removes slides without losing the last one', () => {
    let deck = parseDeck(DECK);
    deck = insertSlide(deck, 0, '## Inserted');
    expect(deck.slides[1]).toBe('## Inserted');
    deck = replaceSlide(deck, 1, '## Replaced');
    expect(deck.slides[1]).toBe('## Replaced');
    deck = moveSlide(deck, 1, 0);
    expect(deck.slides[0]).toBe('## Replaced');
    expect(moveSlide(deck, 0, 99)).toBe(deck);
    expect(removeSlide(deck, 0).slides).toHaveLength(3);
    expect(removeSlide({ meta: {}, slides: ['only'] }, 0).slides).toEqual(['only']);
  });

  it('splits visual blocks out of the text and puts them back', () => {
    const slide = '## Sales\n\nUp this year\n\n```chart\n{"data":[{"x":"a","y":1}]}\n```';
    const segments = slideSegments(slide);
    expect(segments.map((segment) => segment.kind)).toEqual(['markdown', 'chart']);
    const { text, visuals } = splitSlideForEditing(slide);
    expect(text).toBe('## Sales\n\nUp this year');
    expect(joinEditedSlide('## Revenue', visuals)).toBe(
      '## Revenue\n\n```chart\n{"data":[{"x":"a","y":1}]}\n```',
    );
    const chart = segments[1]!;
    expect(chart.kind).toBe('chart');
    if (chart.kind !== 'markdown')
      expect(replaceVisualBlock(slide, chart.start, null)).toBe('## Sales\n\nUp this year');
  });

  it('names a slide by its heading', () => {
    expect(slideTitle('## **Roadmap**\n\ntext', 0)).toBe('Roadmap');
    expect(slideTitle('', 4)).toBe('Slide 5');
  });

  it('names a slide whose heading is a long run of spaces by its number', () => {
    expect(slideTitle(`#${'  '.repeat(100_000)}`, 2)).toBe('Slide 3');
    expect(slideTitle(`#${' '.repeat(100_000)}\nRoadmap`, 2)).toBe('Roadmap');
  });

  it('keeps a fence line with a long run of spaces as text', () => {
    const line = `\`\`\`${' '.repeat(200_000)}!`;
    expect(slideSegments(line)).toEqual([{ kind: 'markdown', text: line }]);
    expect(slideSegments('```chart   \n{}\n```').map((segment) => segment.kind)).toEqual(['chart']);
  });

  it('reads no setting from a long run of letters in the deck line', () => {
    expect(parseDeck(`<!-- deck ${'a'.repeat(200_000)} theme=midnight -->\n\n# A`)).toEqual({
      meta: { theme: 'midnight' },
      slides: ['# A'],
    });
  });

  it('splits kpi and insights fences out of a slide as their own segments', () => {
    const slide = '## Analysis\n\n```kpi\nA | 1\n```\n\n```insights\n- x\n```';
    expect(slideSegments(slide).map((segment) => segment.kind)).toEqual([
      'markdown',
      'kpi',
      'insights',
    ]);
  });
});
