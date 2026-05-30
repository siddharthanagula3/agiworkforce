/**
 * Guard test: no dead form endpoints
 *
 * Encodes the DoD for LAUNCH-SLICE 2a: no page reachable from the landing
 * has a form that submits to a non-existent /api/... route.
 *
 * This test is intentionally static (reads source files) so it catches
 * dead fetches at CI time without needing a running server.
 *
 * Checked pages:
 *   - /contact            → must NOT fetch /api/contact (no such route exists)
 *   - /forgot-password    → must NOT fetch /api/auth/forgot-password
 *   - /auth/update-password → must NOT fetch /api/auth/update-password
 */

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
    // Must not contain a fetch call to the missing route
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
    // Must compose a mailto: href and navigate to it
    expect(src).toContain('mailto:contact@agiworkforce.com');
    expect(src).toContain('window.location.href');
  });

  it('/forgot-password page does not call a dead server route and redirects to /login', () => {
    const src = readPage('app/forgot-password/page.tsx');
    // Must redirect to /login (Clerk <SignIn> owns the full reset flow there)
    expect(src).toContain('/login');
    // Must not fetch to the missing backend route (comments are ok, fetch calls are not)
    expect(src).not.toMatch(/fetch\s*\(\s*['"`]\/api\/auth\/forgot-password['"`]/);
    // Must not contain any fetch to any api route
    expect(src).not.toMatch(/fetch\s*\(\s*['"`]\/api\//);
  });

  it('/auth/update-password page redirects to /login (no dead fetch)', () => {
    const src = readPage('app/auth/update-password/page.tsx');
    // Must redirect to /login
    expect(src).toContain('/login');
    // Must not call the missing backend route
    expect(src).not.toContain('/api/auth/update-password');
  });

  it('/api/waitlist/cloud-managed route is untouched (exports POST, has CSRF + rate-limit)', () => {
    const waitlistRoute = readPage('app/api/waitlist/cloud-managed/route.ts');
    // Waitlist route must still exist and export POST
    expect(waitlistRoute).toContain('export const POST');
    // Must still enforce CSRF
    expect(waitlistRoute).toContain('requireCsrfToken');
    // Must still enforce rate limiting
    expect(waitlistRoute).toContain('withRateLimit');
  });
});
