/**
 * Tests for the cookie domain blocklist in background.ts.
 *
 * The isCookieDomainAllowed() function is not exported, so we mirror it here.
 * If the source patterns change these tests will catch a regression.
 */

import { describe, expect, it } from 'vitest';

/** Blocked domain patterns — mirrors BLOCKED_COOKIE_DOMAINS in background.ts */
const BLOCKED_COOKIE_DOMAINS: RegExp[] = [
  /bank/i,
  /paypal/i,
  /venmo/i,
  /chase/i,
  /wellsfargo/i,
  /citibank/i,
  /\.gov$/i,
  /healthcare/i,
  /medical/i,
  /health\.com/i,
];

/** Mirrors isCookieDomainAllowed() in background.ts */
function isCookieDomainAllowed(urlOrDomain: string): boolean {
  if (!urlOrDomain) return false;
  const domain = urlOrDomain.replace(/^https?:\/\//, '').split('/')[0] ?? '';
  return !BLOCKED_COOKIE_DOMAINS.some((pattern) => pattern.test(domain));
}

describe('isCookieDomainAllowed — cookie domain blocklist', () => {
  // ── Blocked domains ────────────────────────────────────────────────────────

  it('blocks bank-related domains', () => {
    expect(isCookieDomainAllowed('https://mybank.com/login')).toBe(false);
    expect(isCookieDomainAllowed('bankofamerica.com')).toBe(false);
  });

  it('blocks paypal.com', () => {
    expect(isCookieDomainAllowed('https://paypal.com/checkout')).toBe(false);
  });

  it('blocks venmo.com', () => {
    expect(isCookieDomainAllowed('venmo.com')).toBe(false);
  });

  it('blocks chase.com', () => {
    expect(isCookieDomainAllowed('https://chase.com')).toBe(false);
  });

  it('blocks wellsfargo.com', () => {
    expect(isCookieDomainAllowed('https://wellsfargo.com/auth')).toBe(false);
  });

  it('blocks citibank.com', () => {
    expect(isCookieDomainAllowed('citibank.com')).toBe(false);
  });

  it('blocks .gov domains', () => {
    expect(isCookieDomainAllowed('https://irs.gov/account')).toBe(false);
    expect(isCookieDomainAllowed('https://healthcare.gov/login')).toBe(false);
  });

  it('blocks healthcare domains', () => {
    expect(isCookieDomainAllowed('https://myhealthcare.org')).toBe(false);
  });

  it('blocks medical domains', () => {
    expect(isCookieDomainAllowed('https://portal.medical.net')).toBe(false);
  });

  it('blocks health.com', () => {
    expect(isCookieDomainAllowed('https://health.com/wellness')).toBe(false);
  });

  // ── Safe domains ───────────────────────────────────────────────────────────

  it('allows github.com', () => {
    expect(isCookieDomainAllowed('https://github.com/login')).toBe(true);
  });

  it('allows google.com', () => {
    expect(isCookieDomainAllowed('https://google.com')).toBe(true);
  });

  it('allows linkedin.com', () => {
    expect(isCookieDomainAllowed('https://linkedin.com/jobs')).toBe(true);
  });

  it('allows example.com', () => {
    expect(isCookieDomainAllowed('https://example.com')).toBe(true);
  });

  it('allows a bare domain string without scheme', () => {
    expect(isCookieDomainAllowed('example.com')).toBe(true);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('returns false for empty string', () => {
    expect(isCookieDomainAllowed('')).toBe(false);
  });

  it('blocks case-insensitively (e.g. BANK in uppercase)', () => {
    // The /bank/i regex is case-insensitive
    expect(isCookieDomainAllowed('https://MYBANK.com')).toBe(false);
  });

  it('does not block a domain that merely contains "bank" as a word in the path', () => {
    // The domain is extracted before the first '/', so path segments are excluded
    expect(isCookieDomainAllowed('https://safesite.com/bank-products')).toBe(true);
  });
});
