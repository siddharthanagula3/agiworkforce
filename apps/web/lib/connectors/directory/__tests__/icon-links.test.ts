import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { discoverIconLinks } from '@/lib/connectors/directory/icon-links';

function recorded(name: string): string {
  return readFileSync(join(__dirname, 'recorded', name), 'utf8');
}

const CLOSE_PAGE = 'https://www.close.com/';
const CLAY_PAGE = 'https://www.clay.com/';
const CLOSE_CDN = 'https://cdn.prod.website-files.com/61717799a852418a278cfa9b';
const CLAY_CDN = 'https://cdn.prod.website-files.com/61477f2c24a826836f969afe';

describe('discoverIconLinks', () => {
  it('reads the recorded close.com head: icon links first, apple touch icon last, duplicates collapsed', () => {
    expect(discoverIconLinks(recorded('close-com-head.html'), CLOSE_PAGE)).toEqual([
      `${CLOSE_CDN}/69e787e66659174d6c555923_favicon.png`,
      `${CLOSE_CDN}/66268a52e0119bfb4fb75e16_webclip.png`,
    ]);
  });

  it('reads the recorded clay.com head in document order within each rank', () => {
    expect(discoverIconLinks(recorded('clay-com-head.html'), CLAY_PAGE)).toEqual([
      `${CLAY_CDN}/6a3a92ab841a6313dc068fb8_dot-com_favicon_2026_512.png`,
      `${CLAY_CDN}/6a3a92ab03ef81bab42cb009_dot-com_favicon_2026_512.png`,
      `${CLAY_CDN}/6a3a92abeec5075ebf511920_dot-com_favicon_2026_512.png`,
      `${CLAY_CDN}/6a3a92ab2ebcb50096cbd51a_dot-com_favicon_2026_512.png`,
      `${CLAY_CDN}/6a3a92ab3c92c9caa6245619_dot-com_favicon_2026_512.png`,
    ]);
  });

  it('orders icon before shortcut icon before apple touch icon and resolves relative hrefs against the page', () => {
    const html = [
      '<link rel="apple-touch-icon" href="/touch.png">',
      "<link rel='shortcut icon' href='favicon.ico?v=2&amp;w=1'>",
      '<link rel=icon href=/assets/icon.svg type=image/svg+xml>',
      '<link rel="mask-icon" href="/mask.svg">',
      '<link rel="stylesheet" href="/site.css">',
      '<link rel="icon" href="data:image/png;base64,AAAA">',
      '<link rel="ICON" href="//static.example.net/icon-192.png">',
    ].join('\n');

    expect(discoverIconLinks(html, 'https://www.example.com/docs/page')).toEqual([
      'https://www.example.com/assets/icon.svg',
      'https://static.example.net/icon-192.png',
      'https://www.example.com/docs/favicon.ico?v=2&w=1',
      'https://www.example.com/touch.png',
    ]);
  });

  it('returns nothing for a head without icon links or with unusable hrefs', () => {
    expect(discoverIconLinks('<html><head><title>x</title></head></html>', CLOSE_PAGE)).toEqual([]);
    expect(discoverIconLinks('<link rel="icon" href="">', CLOSE_PAGE)).toEqual([]);
    expect(discoverIconLinks('<link rel="icon">', CLOSE_PAGE)).toEqual([]);
  });
});
