import { describe, it, expect } from 'vitest';
import { isImageSelection, replaceImageInHtml } from './design-edits';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('replaceImageInHtml', () => {
  it('swaps only the src of the picked image when its source is unique', () => {
    const source = '<main><img src="a.png" alt="A"><img src="b.png" alt="B"></main>';
    const next = replaceImageInHtml(source, 'main > img:nth-of-type(2)', PNG);
    expect(next).toBe(`<main><img src="a.png" alt="A"><img src="${PNG}" alt="B"></main>`);
  });

  it('falls back to the parsed document when the same source repeats, keeping the doctype', () => {
    const source =
      '<!DOCTYPE html><html><head><title>x</title></head><body><img src="same.png"><img src="same.png"></body></html>';
    const next = replaceImageInHtml(source, 'body > img:nth-of-type(1)', PNG)!;
    expect(next.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(next).toContain(`<img src="${PNG}"><img src="same.png">`);
  });

  it('refuses a selector that does not name an image', () => {
    expect(replaceImageInHtml('<p>hi</p>', 'p', PNG)).toBeNull();
    expect(replaceImageInHtml('<p>hi</p>', 'img', PNG)).toBeNull();
    expect(replaceImageInHtml('<p>hi</p>', '>>bad', PNG)).toBeNull();
  });

  it('recognises an image selection from its markup', () => {
    expect(isImageSelection('<img src="x">')).toBe(true);
    expect(isImageSelection('<div><img></div>')).toBe(false);
  });
});
