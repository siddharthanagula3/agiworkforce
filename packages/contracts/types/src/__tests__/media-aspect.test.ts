import { describe, expect, it } from 'vitest';
import { hasKnownMediaFrame, parseMediaAspectRatio } from '../media-aspect';

describe('parseMediaAspectRatio', () => {
  it('reads a width:height ratio, including pixel sizes and decimals', () => {
    expect(parseMediaAspectRatio('16:9')).toBe(16 / 9);
    expect(parseMediaAspectRatio('1280:720')).toBe(16 / 9);
    expect(parseMediaAspectRatio('2.39:1')).toBe(2.39);
    expect(parseMediaAspectRatio('3:4')).toBe(0.75);
  });

  it('has no ratio for automatic, malformed or degenerate values', () => {
    expect(parseMediaAspectRatio(undefined)).toBeNull();
    expect(parseMediaAspectRatio('auto')).toBeNull();
    expect(parseMediaAspectRatio('16x9')).toBeNull();
    expect(parseMediaAspectRatio('0:9')).toBeNull();
    expect(parseMediaAspectRatio('9:0')).toBeNull();
  });
});

describe('hasKnownMediaFrame', () => {
  it('is true only when a placeholder can take the requested shape', () => {
    expect(hasKnownMediaFrame('auto')).toBe(false);
    expect(hasKnownMediaFrame('0:9')).toBe(false);
    expect(hasKnownMediaFrame('1280:720')).toBe(true);
  });
});
