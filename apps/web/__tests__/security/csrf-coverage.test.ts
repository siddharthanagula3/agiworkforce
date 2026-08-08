import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Every cookie-authenticated, state-changing API route must verify a CSRF
 * token.
 *
 * A sweep of all 126 state-changing routes found the control correctly applied
 * — the 19 without it are all genuinely exempt. This test exists so that stays
 * true: the risk is not the current tree, it is the NEXT route. A new POST
 * handler that calls `getClerkAuthUser` and forgets `requireCsrfToken` is a
 * one-line omission that no reviewer reliably notices, because the defect is
 * an absence.
 *
 * Why cookie auth is the discriminator: `getClerkAuthUser` takes Path 1
 * (`await auth()`, a Clerk session cookie) only when the request carries NO
 * Authorization header. Browsers attach cookies to cross-site requests but
 * never an Authorization header, so a Bearer-only route cannot be driven by an
 * attacker's page and needs no token. Routes that reject requests lacking a
 * Bearer header are therefore exempt by construction.
 */
const API_ROOT = path.resolve(import.meta.dirname, '../../app/api');

const MUTATING = /export\s+(?:const|async\s+function)\s+(POST|PUT|PATCH|DELETE)\b/;
const COOKIE_AUTH = /getClerkAuthUser\s*\(/;
const CSRF = /requireCsrfToken|withCsrf/;
/** Returns 410 and touches nothing — no state to protect. */
const RETIRED = /ENDPOINT_RETIRED|status:\s*410/;

/**
 * Routes exempt for a structural reason, each with the reason recorded. An
 * entry without a justification is how this check quietly stops meaning
 * anything, so the shape is enforced below.
 */
const EXEMPT: Record<string, string> = {
  'stripe-webhook/route.ts':
    'Stripe signs the payload; there is no cookie principal and no browser involved.',
  'llm/v1/chat/completions/approve/route.ts':
    'runAuthGate rejects any request without a Bearer header, so a browser cannot drive it.',
  'auth/device/code/route.ts':
    'Two handlers, two principals. The cookie-authenticated one is the GET lookup, whose only write marks an ALREADY-expired code as expired — idempotent housekeeping an attacker gains nothing from. The POST is unauthenticated RFC 8628 device-code creation with no cookie principal at all.',
};

/**
 * LIMITATION, stated so the exemption above is not mistaken for a clean bill.
 * This check is FILE-granular: it asks whether a file exports a mutating
 * handler and whether it mentions getClerkAuthUser, not whether those are the
 * same handler. A file with a cookie-authenticated GET and an unauthenticated
 * POST therefore matches, which is exactly why auth/device/code is listed. Per
 * handler analysis needs a real parse; until then the exemption list carries
 * the reasoning, and a new single-handler route — the common case, and the one
 * that would actually be vulnerable — is still caught.
 */

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
      if (!COOKIE_AUTH.test(src)) continue; // Bearer-only: browsers cannot drive it.
      if (RETIRED.test(src)) continue; // 410, no state to protect.
      if (rel in EXEMPT) continue;
      if (CSRF.test(src)) continue;

      offenders.push(rel);
    }

    expect(
      offenders,
      `these routes change state, authenticate via a Clerk session COOKIE, and verify no ` +
        `CSRF token — an attacker's page can drive them with the victim's cookies:\n  ` +
        `${offenders.join('\n  ')}\n\nAdd requireCsrfToken, or record a structural reason in EXEMPT.`,
    ).toEqual([]);
  });

  it('keeps the exemption list honest', () => {
    // A stale exemption reads as "considered and allowed" for a file that may
    // no longer exist, or may since have grown a cookie-auth path.
    for (const [rel, reason] of Object.entries(EXEMPT)) {
      const full = path.join(API_ROOT, rel);
      expect(fs.existsSync(full), `stale CSRF exemption: ${rel}`).toBe(true);
      expect(reason.length, `exemption for ${rel} needs a real reason`).toBeGreaterThan(30);
    }
  });
});
