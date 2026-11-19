import { describe, expect, it } from 'vitest';
import { FILENAME_ALT, imageTitle, readableImageAlt } from '../markdownImageSources';

describe('readableImageAlt', () => {
  it('turns a file-name alt into words', () => {
    expect(readableImageAlt('sunset-over-bay.png')).toBe('Sunset over bay');
    expect(readableImageAlt('team_photo_2024.JPEG')).toBe('Team photo 2024');
  });

  it('keeps a written alt as it is, trimmed', () => {
    expect(readableImageAlt('  A red barn at dusk ')).toBe('A red barn at dusk');
    expect(readableImageAlt(undefined)).toBe('');
  });

  it('gives an empty alt for a bare extension', () => {
    expect(readableImageAlt('.png')).toBe('.png');
    expect(readableImageAlt('-.png')).toBe('');
  });
});

describe('imageTitle', () => {
  it('keeps an explicit title that is not a file name', () => {
    expect(imageTitle('Golden hour', 'sunset.png')).toBe('Golden hour');
  });

  it('hides a file-name title and a file-name alt', () => {
    expect(imageTitle('sunset-over-bay.png', 'sunset-over-bay.png')).toBeUndefined();
    expect(imageTitle(undefined, 'sunset-over-bay.png')).toBeUndefined();
  });

  it('falls back to a written alt', () => {
    expect(imageTitle(undefined, 'A red barn')).toBe('A red barn');
    expect(imageTitle('  ', '')).toBeUndefined();
  });

  it('recognises the image extensions it names', () => {
    expect(FILENAME_ALT.test('chart.webp')).toBe(true);
    expect(FILENAME_ALT.test('notes.txt')).toBe(false);
  });
});
