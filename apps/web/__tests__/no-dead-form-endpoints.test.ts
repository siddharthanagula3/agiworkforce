import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import { CONTACT_EMAIL, contactMailto } from '@/lib/legal-constants';

const ROOT = resolve(__dirname, '..');

function readPage(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

describe('no dead form endpoints, guard', () => {
  it('/contact page does not fetch /api/contact (route does not exist)', () => {
    const src = readPage('app/contact/page.tsx');
    expect(src).not.toMatch(/fetch\s*\(\s*['"`]\/api\/contact['"`]/);
  });

  it('/auth/update-password page does not fetch /api/auth/update-password (route does not exist)', () => {
    const src = readPage('app/auth/update-password/page.tsx');
    expect(src).not.toMatch(/fetch\s*\(\s*['"`]\/api\/auth\/update-password['"`]/);
  });

  it('/contact page uses mailto path as the submit mechanism', () => {
    const src = readPage('app/contact/page.tsx');
    expect(src).toContain('window.location.href = contactMailto(subject, body);');
    expect(src).not.toContain('mailto:');
    expect(src).not.toContain(CONTACT_EMAIL);
    expect(contactMailto('Hello there', 'Name: A\n\nA & B?')).toBe(
      `mailto:${CONTACT_EMAIL}?subject=Hello%20there&body=Name%3A%20A%0A%0AA%20%26%20B%3F`,
    );
    expect(contactMailto('', 'Body only')).toBe(`mailto:${CONTACT_EMAIL}?body=Body%20only`);
    expect(contactMailto()).toBe(`mailto:${CONTACT_EMAIL}`);
  });

  it('/payment-failure page reads the support address instead of typing it', () => {
    const src = readPage('app/payment-failure/page.tsx');
    expect(src).toContain('href={contactMailto()}');
    expect(src).toContain('{CONTACT_EMAIL}');
    expect(src).not.toContain('mailto:');
    expect(src).not.toContain(CONTACT_EMAIL);
  });

  it('/auth/error page reads the support address instead of typing it', () => {
    const src = readPage('app/auth/error/page.tsx');
    expect(src).toContain('href={contactMailto()}');
    expect(src).toContain('{CONTACT_EMAIL}');
    expect(src).not.toContain('mailto:');
    expect(src).not.toContain(CONTACT_EMAIL);
  });

  it('/forgot-password is a config redirect to /login, not a page that could fetch a dead route', () => {
    expect(existsSync(resolve(ROOT, 'app/forgot-password'))).toBe(false);
    const config = readPage('next.config.ts');
    expect(config).toMatch(/source: '\/forgot-password', destination: '\/login'/);
  });

  it('/auth/update-password page redirects to /login (no dead fetch)', () => {
    const src = readPage('app/auth/update-password/page.tsx');
    expect(src).toContain('/login');
    expect(src).not.toContain('/api/auth/update-password');
  });

  it('/api/waitlist/cloud-managed route is untouched (exports POST, has CSRF + rate-limit)', () => {
    const waitlistRoute = readPage('app/api/waitlist/cloud-managed/route.ts');
    expect(waitlistRoute).toContain('export const POST');
    expect(waitlistRoute).toContain('requireCsrfToken');
    expect(waitlistRoute).toContain('withRateLimit');
  });
});
