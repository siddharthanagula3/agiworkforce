
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

function readPage(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

describe('no dead form endpoints — guard', () => {
  it('/contact page does not fetch /api/contact (route does not exist)', () => {
    const src = readPage('app/contact/page.tsx');
    expect(src).not.toMatch(/fetch\s*\(\s*['"`]\/api\/contact['"`]/);
  });

  it('/forgot-password page does not fetch /api/auth/forgot-password (route does not exist)', () => {
    const src = readPage('app/forgot-password/page.tsx');
    expect(src).not.toMatch(/fetch\s*\(\s*['"`]\/api\/auth\/forgot-password['"`]/);
  });

  it('/auth/update-password page does not fetch /api/auth/update-password (route does not exist)', () => {
    const src = readPage('app/auth/update-password/page.tsx');
    expect(src).not.toMatch(/fetch\s*\(\s*['"`]\/api\/auth\/update-password['"`]/);
  });

  it('/contact page uses mailto path as the submit mechanism', () => {
    const src = readPage('app/contact/page.tsx');
    expect(src).toContain('mailto:contact@agiworkforce.com');
    expect(src).toContain('window.location.href');
  });

  it('/forgot-password page does not call a dead server route and redirects to /login', () => {
    const src = readPage('app/forgot-password/page.tsx');
    expect(src).toContain('/login');
    expect(src).not.toMatch(/fetch\s*\(\s*['"`]\/api\/auth\/forgot-password['"`]/);
    expect(src).not.toMatch(/fetch\s*\(\s*['"`]\/api\//);
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
