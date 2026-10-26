import { describe, expect, it } from 'vitest';

import { extractSvgSlides } from '../svgGallery';

const SQUARE = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="${fill}"/></svg>`;

describe('svg concept slides', () => {
  it('turns three svg fences into slides and removes the raw source', () => {
    const markdown = [
      'Here are the concepts.',
      '',
      '```svg',
      SQUARE('#2f6fed'),
      '```',
      '',
      '```svg',
      SQUARE('#1f4fd8'),
      '```',
      '',
      '```svg',
      SQUARE('#5b8def'),
      '```',
    ].join('\n');
    const extracted = extractSvgSlides(markdown);

    expect(extracted.slides).toHaveLength(3);
    expect(extracted.markdown).not.toContain('<svg');
    expect(extracted.markdown).toContain('Here are the concepts.');
  });

  it('splits several svg roots in one fence', () => {
    const markdown = [
      '```svg',
      SQUARE('#111111'),
      SQUARE('#222222'),
      SQUARE('#333333'),
      '```',
    ].join('\n');
    expect(extractSvgSlides(markdown).slides).toHaveLength(3);
  });
});
