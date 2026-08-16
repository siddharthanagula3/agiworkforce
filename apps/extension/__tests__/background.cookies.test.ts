
import { describe, expect, it } from 'vitest';

const BLOCKED_COOKIE_DOMAINS: RegExp[] = [
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
  /\.gov$/i,
  /\.mil$/i,
  /healthcare/i,
  /medical/i,
  /health\.com/i,
  /aws\.amazon\.com/i,
  /console\.cloud\.google/i,
  /portal\.azure/i,
  /github\.com$/i,
  /gitlab\.com$/i,
  /bitbucket\.org$/i,
  /accounts\.google/i,
  /login\.microsoftonline/i,
  /auth0\.com$/i,
  /okta\.com$/i,
  /mail\.google/i,
  /outlook\.(live|office)/i,
  /facebook\.com$/i,
  /twitter\.com$/i,
  /x\.com$/i,
  /instagram\.com$/i,
  /(^|\.)agiworkforce\.com$/i,
  /(^|\.)linkedin\.com$/i,
  /(^|\.)slack\.com$/i,
  /(^|\.)notion\.so$/i,
  /(^|\.)figma\.com$/i,
  /(^|\.)lever\.co$/i,
  /(^|\.)greenhouse\.io$/i,
  /(^|\.)workday\.com$/i,
];

function isCookieDomainAllowed(urlOrDomain: string): boolean {
  if (!urlOrDomain) return false;
  const domain = urlOrDomain.replace(/^https?:\/\//, '').split('/')[0] ?? '';
  return !BLOCKED_COOKIE_DOMAINS.some((pattern) => pattern.test(domain));
}

describe('isCookieDomainAllowed — cookie domain blocklist', () => {

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
    expect(isCookieDomainAllowed('https://linkedin.com.evil.com/data')).toBe(true);
  });

  it('blocks github.com (CHROME-NEW-002)', () => {
    expect(isCookieDomainAllowed('https://github.com/login')).toBe(false);
  });

  it('allows google.com (search, not auth)', () => {
    expect(isCookieDomainAllowed('https://google.com')).toBe(true);
  });

  it('allows example.com', () => {
    expect(isCookieDomainAllowed('https://example.com')).toBe(true);
  });

  it('allows a bare domain string without scheme', () => {
    expect(isCookieDomainAllowed('example.com')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isCookieDomainAllowed('')).toBe(false);
  });

  it('blocks case-insensitively (e.g. BANK in uppercase)', () => {
    expect(isCookieDomainAllowed('https://MYBANK.com')).toBe(false);
  });

  it('does not block a domain that merely contains "bank" as a word in the path', () => {
    expect(isCookieDomainAllowed('https://safesite.com/bank-products')).toBe(true);
  });
});
