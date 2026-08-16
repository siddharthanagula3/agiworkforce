import { describe, expect, it } from 'vitest';
import { pageChipLabel } from '../src/utils';

describe('pageChipLabel', () => {
  it.each([
    ['https://example.com/some/path?q=1', 'example.com'],
    ['http://localhost:3000/chat', 'localhost'],
    ['https://sub.domain.co.uk/', 'sub.domain.co.uk'],
  ])('shows the hostname for %s', (url, expected) => {
    expect(pageChipLabel(url)).toBe(expected);
  });

  it.each([
    'chrome-extension://ldfbegeiejcnnmfjlapffgoolhfkamjk/src/side_panel.html',
    'chrome://settings/privacy',
    'about:blank',
    'devtools://devtools/bundled/inspector.html',
    'edge://extensions',
    'file:///Users/someone/notes.html',
  ])('does not leak an internal identifier for %s', (url) => {
    const label = pageChipLabel(url);
    expect(label).toBe('Browser page');
    expect(label).not.toContain('ldfbegeiejcnnmfjlapffgoolhfkamjk');
  });

  it.each(['', 'not a url', '://malformed'])('renders nothing for unusable input %s', (url) => {
    expect(pageChipLabel(url)).toBe('');
  });
});
