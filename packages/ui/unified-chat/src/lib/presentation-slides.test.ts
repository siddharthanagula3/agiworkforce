import { describe, expect, it } from 'vitest';
import { splitSlides } from './presentation-slides';

describe('splitSlides', () => {
  it('splits on horizontal rules first', () => {
    expect(splitSlides('# One\nIntro\n\n---\n\n# Two\r\nMore')).toEqual([
      '# One\nIntro',
      '# Two\nMore',
    ]);
  });

  it('splits on top headings when there are no rules', () => {
    expect(splitSlides('# Deck\nLead\n## Point\nDetail\n### Sub stays')).toEqual([
      '# Deck\nLead',
      '## Point\nDetail\n### Sub stays',
    ]);
  });

  it('gives no slides for empty content', () => {
    expect(splitSlides('  \n ')).toEqual([]);
  });
});
