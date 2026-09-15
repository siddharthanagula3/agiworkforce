import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

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
    expect(src).toContain('mailto:contact@agiworkforce.com');
    expect(src).toContain('window.location.href');
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
