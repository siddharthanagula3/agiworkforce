// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isAgiWorkforceUniversalLinkHost } = require('../src/integrations/universalLinks');

describe('reset-password deep-link URL predicate (replicated from _layout.tsx)', () => {
  function isResetPasswordUrl(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'https:') return false;
    if (!isAgiWorkforceUniversalLinkHost(parsed.hostname)) return false;
    const segments = parsed.pathname.split('/').filter(Boolean);
    return segments[0] === 'auth' && segments[1] === 'reset-password' && segments.length === 2;
  }

  it.each([
    'https://agiworkforce.com/auth/reset-password',
    'https://agiworkforce.com/auth/reset-password?code=abcdef',
    'https://agiworkforce.com/auth/reset-password#access_token=x&type=recovery',
    'https://AGIWORKFORCE.COM/auth/reset-password', // hostname is case-insensitive
  ])('accepts %s', (url) => {
    expect(isResetPasswordUrl(url)).toBe(true);
  });

  it.each([
    ['rejects custom scheme', 'agiworkforce://reset-password#access_token=x&type=recovery'],
    ['rejects http (must be https)', 'http://agiworkforce.com/auth/reset-password'],
    ['rejects redirect-only www host', 'https://www.agiworkforce.com/auth/reset-password'],
    ['rejects different hostname', 'https://attacker.com/auth/reset-password'],
    [
      'rejects subdomain takeover',
      'https://attacker.agiworkforce.com.evil.com/auth/reset-password',
    ],
    ['rejects pair URL (different deep-link)', 'https://agiworkforce.com/pair/ABCDEFGH'],
    ['rejects unrelated path', 'https://agiworkforce.com/auth/login'],
    ['rejects extra path segments', 'https://agiworkforce.com/auth/reset-password/attacker'],
    ['rejects malformed URL', 'not a url'],
    ['rejects empty', ''],
    ['rejects javascript:', 'javascript:alert(1)//https://agiworkforce.com/auth/reset-password'],
  ])('%s', (_label, url) => {
    expect(isResetPasswordUrl(url)).toBe(false);
  });
});

describe('drift sentinel, _layout.tsx still enforces the predicate', () => {
  it('the layout file references the expected predicate fields', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');
    expect(src).toContain("scheme === 'https'");
    expect(src.match(/isAgiWorkforceUniversalLinkHost\(hostname\)/gu)).toHaveLength(2);
    expect(src).toContain("segments[0] === 'auth'");
    expect(src).toContain("segments[1] === 'reset-password'");
    expect(src).toContain('segments.length === 2');
  });
});
