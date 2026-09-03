import { describe, expect, it } from 'vitest';
import { humanizedPathTitle } from './ResearchPanel';

describe('humanizedPathTitle', () => {
  it('turns a dashed path slug into a headline-shaped label', () => {
    expect(humanizedPathTitle('https://openai.com/index/previewing-ultrafast/')).toBe(
      'Previewing Ultrafast',
    );
  });

  it('strips a trailing file extension', () => {
    expect(humanizedPathTitle('https://example.com/reports/q3-summary.html')).toBe('Q3 Summary');
  });

  it('collapses underscores the same as dashes', () => {
    expect(humanizedPathTitle('https://example.com/blog/pixel_watch_5')).toBe('Pixel Watch 5');
  });

  it('returns undefined for a bare-domain url with no path', () => {
    expect(humanizedPathTitle('https://openai.com/')).toBeUndefined();
    expect(humanizedPathTitle('https://openai.com')).toBeUndefined();
  });

  it('returns undefined for an unparseable url', () => {
    expect(humanizedPathTitle('not a url')).toBeUndefined();
  });
});
