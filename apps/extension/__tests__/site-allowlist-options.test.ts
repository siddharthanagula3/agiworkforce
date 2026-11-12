import { describe, expect, it } from 'vitest';
import {
  normalizeApprovedSiteOrigin,
  sanitizeApprovedSiteOrigins,
  selectApprovedSiteOrigin,
} from '../src/features/options/site-allowlist';

describe('options site allowlist', () => {
  it('accepts only canonical http(s) origins', () => {
    expect(normalizeApprovedSiteOrigin('https://example.com/path?q=1')).toBe('https://example.com');
    expect(normalizeApprovedSiteOrigin('http://localhost:3000/page')).toBe('http://localhost:3000');
    expect(normalizeApprovedSiteOrigin('No site open')).toBeNull();
    expect(normalizeApprovedSiteOrigin('chrome-extension://test/options.html')).toBeNull();
    expect(normalizeApprovedSiteOrigin('javascript:alert(1)')).toBeNull();
  });

  it("prefers the most recently used eligible tab over another window's active tab", () => {
    expect(
      selectApprovedSiteOrigin([
        { url: 'https://other-window.example/y', active: true, lastAccessed: 1 },
        { url: 'https://left-behind.example/x', active: false, lastAccessed: 9 },
        { url: 'chrome-extension://test/options.html', active: true, lastAccessed: 10 },
      ]),
    ).toBe('https://left-behind.example');
  });

  it('breaks a tie on last use in favour of the active tab', () => {
    expect(
      selectApprovedSiteOrigin([
        { url: 'https://background.example/a', lastAccessed: 5 },
        { url: 'https://active.example/b', active: true, lastAccessed: 5 },
      ]),
    ).toBe('https://active.example');
  });

  it('prefers the most recent eligible tab and skips tabs that are not web pages', () => {
    expect(
      selectApprovedSiteOrigin([
        { url: 'chrome://extensions', active: true, lastAccessed: 30 },
        { url: 'https://older.example/a', lastAccessed: 10 },
        { url: 'https://active.example/b', active: true, lastAccessed: 20 },
      ]),
    ).toBe('https://active.example');
    expect(
      selectApprovedSiteOrigin([
        { url: 'https://older.example/a', lastAccessed: 10 },
        { url: 'https://newer.example/b', lastAccessed: 20 },
      ]),
    ).toBe('https://newer.example');
    expect(selectApprovedSiteOrigin([{ url: 'about:blank', active: true }])).toBeNull();
  });

  it('drops invalid stored values and de-duplicates canonical origins', () => {
    expect(
      sanitizeApprovedSiteOrigins([
        'https://example.com/a',
        'https://example.com/b',
        'No site open',
        null,
      ]),
    ).toEqual(['https://example.com']);
  });
});
