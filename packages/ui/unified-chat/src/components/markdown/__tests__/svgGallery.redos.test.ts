import { describe, expect, it } from 'vitest';

import { extractSvgSlides } from '../svgGallery';

const HOSTILE_BUDGET_MS = 2000;

describe('svg slides on a hostile reply', () => {
  it('reads an svg fence full of svg openers that never close in linear time', () => {
    const markdown = `\`\`\`svg\n${'<svg '.repeat(150_000)}\n\`\`\``;
    const started = performance.now();
    const extracted = extractSvgSlides(markdown);
    expect(performance.now() - started).toBeLessThan(HOSTILE_BUDGET_MS);
    expect(extracted.slides).toEqual([]);
    expect(extracted.markdown).toBe(markdown);
  });

  it('keeps the closed elements that follow a run of unterminated openers', () => {
    const element = '<svg viewBox="0 0 1 1"><rect/></svg>';
    const markdown = `\`\`\`svg\n<svg <svg ${element}<SVG a></SVG>\n\`\`\``;
    expect(extractSvgSlides(markdown).slides).toEqual(['<svg <svg ' + element, '<SVG a></SVG>']);
  });

  it('takes each element up to the first closing tag', () => {
    const markdown = '```xml\n<svg><svg></svg><svg b></svg></svg>\n```';
    expect(extractSvgSlides(markdown).slides).toEqual(['<svg><svg></svg>', '<svg b></svg>']);
  });
});
