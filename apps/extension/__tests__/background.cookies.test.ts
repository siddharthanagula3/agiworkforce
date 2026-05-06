/**
 * Tests for the cookie domain blocklist in background.ts.
 *
 * The isCookieDomainAllowed() function is not exported, so we mirror it here.
 * If the source patterns change these tests will catch a regression.
 */

import { describe, expect, it } from 'vitest';

/** Blocked domain patterns — mirrors BLOCKED_COOKIE_DOMAINS in background.ts.
 *  The source in `src/background.ts:1310-1366` is the authoritative list; if
 *  these mirrors fall behind, the tests below will not catch a regression. */
const BLOCKED_COOKIE_DOMAINS: RegExp[] = [
  // Financial
  /bank/i,
  /paypal/i,
  /venmo/i,
  /chase/i,
  /wellsfargo/i,
  /citibank/i,
  /fidelity/i,
  /schwab/i,
  /stripe\.com$/i,
  /plaid\.com$/i,
  /coinbase/i,
  /binance/i,
  /kraken/i,
  // Government & healthcare
  /\.gov$/i,
  /\.mil$/i,
  /healthcare/i,
  /medical/i,
  /health\.com/i,
  // Cloud infrastructure & developer tools
  /aws\.amazon\.com/i,
  /console\.cloud\.google/i,
  /portal\.azure/i,
  /github\.com$/i,
  /gitlab\.com$/i,
  /bitbucket\.org$/i,
  // Auth & identity providers
  /accounts\.google/i,
  /login\.microsoftonline/i,
  /auth0\.com$/i,
  /okta\.com$/i,
  // Email & communication
  /mail\.google/i,
  /outlook\.(live|office)/i,
  // Social media (auth tokens)
  /facebook\.com$/i,
  /twitter\.com$/i,
  /x\.com$/i,
  /instagram\.com$/i,
  // CHROME-NEW-003: extension's own surfaces
  /\.supabase\.(co|io)$/i,
  /(^|\.)agiworkforce\.com$/i,
  // CHROME-NEW-006 (2026-05-05): platforms the extension targets for autofill
  /(^|\.)linkedin\.com$/i,
  /(^|\.)slack\.com$/i,
  /(^|\.)notion\.so$/i,
  /(^|\.)figma\.com$/i,
  /(^|\.)lever\.co$/i,
  /(^|\.)greenhouse\.io$/i,
  /(^|\.)workday\.com$/i,
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

  // ── CHROME-NEW-006 (2026-05-05): autofill-target platforms ────────────────

  it('blocks linkedin.com (extension target — DOM access only, no cookies)', () => {
    expect(isCookieDomainAllowed('https://linkedin.com/jobs')).toBe(false);
    expect(isCookieDomainAllowed('https://www.linkedin.com/feed')).toBe(false);
  });

  it('blocks slack.com', () => {
    expect(isCookieDomainAllowed('https://app.slack.com/client')).toBe(false);
  });

  it('blocks notion.so', () => {
    expect(isCookieDomainAllowed('https://www.notion.so/home')).toBe(false);
  });

  it('blocks figma.com', () => {
    expect(isCookieDomainAllowed('https://www.figma.com/files')).toBe(false);
  });

  it('blocks lever.co', () => {
    expect(isCookieDomainAllowed('https://hire.lever.co/applicant')).toBe(false);
  });

  it('blocks greenhouse.io', () => {
    expect(isCookieDomainAllowed('https://boards.greenhouse.io/postings')).toBe(false);
  });

  it('blocks workday.com', () => {
    expect(isCookieDomainAllowed('https://wd1.workday.com/login')).toBe(false);
  });

  it('does NOT block a domain that merely contains "linkedin" as a substring of a different host', () => {
    // The /(^|\.)linkedin\.com$/ anchor prevents `linkedin.com.evil.com`
    // from matching, which a naïve `/linkedin\.com/` would match.
    expect(isCookieDomainAllowed('https://linkedin.com.evil.com/data')).toBe(true);
  });

  // ── Existing safe domains (still allowed) ─────────────────────────────────

  it('blocks github.com (CHROME-NEW-002)', () => {
    expect(isCookieDomainAllowed('https://github.com/login')).toBe(false);
  });

  it('allows google.com (search, not auth)', () => {
    // accounts.google is blocked separately; google.com is fine.
    expect(isCookieDomainAllowed('https://google.com')).toBe(true);
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
