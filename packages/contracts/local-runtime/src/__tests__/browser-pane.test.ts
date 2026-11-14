import { describe, expect, it } from 'vitest';
import { browserPaneAddress, browserPaneDecision, browserSiteHost } from '../browser-pane';

const NONE = { allowed: [], blocked: [] };

describe('what the address bar accepts', () => {
  it('adds https to a bare site and http to this computer', () => {
    expect(browserPaneAddress('example.com')).toBe('https://example.com/');
    expect(browserPaneAddress('localhost:3000/app')).toBe('http://localhost:3000/app');
    expect(browserPaneAddress('0.0.0.0:5173')).toBe('http://localhost:5173/');
    expect(browserPaneAddress('https://docs.example.com/a?b=1')).toBe(
      'https://docs.example.com/a?b=1',
    );
  });

  it('refuses anything that is not a web page or carries a password', () => {
    for (const input of [
      '',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'chrome://settings',
      'https://user:pass@example.com',
      'two words',
      `https://${'a'.repeat(2_100)}.com`,
    ]) {
      expect(browserPaneAddress(input), input).toBeNull();
    }
  });
});

describe('whether the pane may show a page', () => {
  it('always opens this computer and asks about any other site', () => {
    expect(browserPaneDecision('http://localhost:3000/', NONE)).toBe('loopback');
    expect(browserPaneDecision('http://127.0.0.1:8080/', NONE)).toBe('loopback');
    expect(browserPaneDecision('https://example.com/', NONE)).toBe('ask');
  });

  it('lets an allowed site and its subdomains open', () => {
    const sites = { allowed: ['example.com'], blocked: [] };
    expect(browserPaneDecision('https://example.com/', sites)).toBe('allowed');
    expect(browserPaneDecision('https://docs.example.com/', sites)).toBe('allowed');
    expect(browserPaneDecision('https://notexample.com/', sites)).toBe('ask');
  });

  it('lets a block win over an allow and over this computer', () => {
    expect(
      browserPaneDecision('https://ads.example.com/', {
        allowed: ['example.com'],
        blocked: ['ads.example.com'],
      }),
    ).toBe('blocked');
    expect(browserPaneDecision('http://localhost/', { allowed: [], blocked: ['localhost'] })).toBe(
      'blocked',
    );
  });

  it('blocks other schemes and passwords outright', () => {
    expect(browserPaneDecision('file:///tmp/x', NONE)).toBe('blocked');
    expect(browserPaneDecision('https://a:b@example.com/', NONE)).toBe('blocked');
    expect(browserPaneDecision('not a url', NONE)).toBe('blocked');
  });
});

describe('site names', () => {
  it('normalizes case and a trailing dot and refuses junk', () => {
    expect(browserSiteHost('Example.COM.')).toBe('example.com');
    expect(browserSiteHost('a..b')).toBeNull();
    expect(browserSiteHost('ex ample.com')).toBeNull();
    expect(browserSiteHost('.example.com')).toBeNull();
  });
});
