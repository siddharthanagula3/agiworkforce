import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const API_ROOT = path.resolve(import.meta.dirname, '../../app/api');

const MUTATING = /export\s+(?:const|async\s+function)\s+(POST|PUT|PATCH|DELETE)\b/;
const COOKIE_AUTH = /getClerkAuthUser\s*\(/;
const CSRF = /requireCsrfToken|withCsrf/;
const RETIRED = /ENDPOINT_RETIRED|status:\s*410/;

const EXEMPT: Record<string, string> = {
  'stripe-webhook/route.ts':
    'Stripe signs the payload; there is no cookie principal and no browser involved.',
  'llm/v1/chat/completions/approve/route.ts':
    'runAuthGate rejects any request without a Bearer header, so a browser cannot drive it.',
  'uploads/local-project-knowledge/route.ts':
    "The bearer here is the signed `?token=`, not the cookie. verifyLocalUploadToken checks an HMAC over claims that BIND the upload to the cookie-derived userId, and additionally pins content-type, byte count and expiry; the nonce is written with the `wx` flag so a token is single-use. A cross-site page cannot mint one, the only issuer is /api/uploads/presign, which is itself cookie-authenticated AND CSRF-checked, and the whole handler throws notFound unless NODE_ENV === 'development'.",
  'auth/device/code/route.ts':
    'Two handlers, two principals. The cookie-authenticated one is the GET lookup, whose only write marks an ALREADY-expired code as expired, idempotent housekeeping an attacker gains nothing from. The POST is unauthenticated RFC 8628 device-code creation with no cookie principal at all.',
};

function routeFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(full, acc);
    else if (entry.name === 'route.ts') acc.push(full);
  }
  return acc;
}

describe('CSRF coverage on state-changing routes', () => {
  const files = routeFiles(API_ROOT);

  it('finds the API routes, so a directory move cannot silently empty this check', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('every cookie-authenticated mutating route verifies a CSRF token', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const rel = path.relative(API_ROOT, file);
      const src = fs.readFileSync(file, 'utf8');

      if (!MUTATING.test(src)) continue;
      if (!COOKIE_AUTH.test(src)) continue;
      if (RETIRED.test(src)) continue;
      if (rel in EXEMPT) continue;
      if (CSRF.test(src)) continue;

      offenders.push(rel);
    }

    expect(
      offenders,
      `these routes change state, authenticate via a Clerk session COOKIE, and verify no ` +
        `CSRF token, an attacker's page can drive them with the victim's cookies:\n  ` +
        `${offenders.join('\n  ')}\n\nAdd requireCsrfToken, or record a structural reason in EXEMPT.`,
    ).toEqual([]);
  });

  it('keeps the exemption list honest', () => {
    for (const [rel, reason] of Object.entries(EXEMPT)) {
      const full = path.join(API_ROOT, rel);
      expect(fs.existsSync(full), `stale CSRF exemption: ${rel}`).toBe(true);
      expect(reason.length, `exemption for ${rel} needs a real reason`).toBeGreaterThan(30);
    }
  });
});
