import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const API_ROOT = path.resolve(import.meta.dirname, '../../app/api');

const MUTATING = /export\s+(?:const|async\s+function)\s+(POST|PUT|PATCH|DELETE)\b/;
const COOKIE_AUTH = /getClerkAuthUser\s*\(|getRequestIdentity\s*\(/;
const CSRF = /requireCsrfToken|withCsrf/;
const RETIRED = /ENDPOINT_RETIRED|status:\s*410/;

const EXEMPT: Record<string, string> = {
  'stripe-webhook/route.ts':
    'Stripe signs the payload; there is no cookie principal and no browser involved.',
  'llm/v1/chat/completions/approve/route.ts':
    'runAuthGate rejects any request without a Bearer header, so a browser cannot drive it.',
  'uploads/local-project-knowledge/route.ts':
    "The bearer here is the signed `?token=`, not the cookie. verifyLocalUploadToken checks an HMAC over claims that BIND the upload to the cookie-derived userId, and additionally pins content-type, byte count and expiry; the nonce is written with the `wx` flag so a token is single-use. A cross-site page cannot mint one, the only issuer is /api/uploads/presign, which is itself cookie-authenticated AND CSRF-checked, and the whole handler throws notFound unless NODE_ENV === 'development'.",
  'voice/transcribe/route.ts':
    'The local wrapper delegates to transcriptionsHandler, which requires CSRF before resolving the Clerk principal; this file only adds the dictation capability admission check.',
  'auth/device/code/route.ts':
    'Two handlers, two principals. The cookie-authenticated one is the GET lookup, whose only write marks an ALREADY-expired code as expired, idempotent housekeeping an attacker gains nothing from. The POST is unauthenticated RFC 8628 device-code creation with no cookie principal at all.',
};

const COOKIE_RESOLVER = /getClerkAuthUser\s*\(|getRequestIdentity\s*\(|getUserScopedDb\s*\(/;
const BEARER_GATE = /runAuthGate\s*\(/;

/**
 * Routes that change state without a CSRF token because no cookie can act as
 * their principal. Each names the call that establishes who is asking; the
 * call has to be in the file, so deleting the check fails here.
 */
const NON_COOKIE_PRINCIPAL: Record<string, { call: RegExp; reason: string }> = {
  'auth/device/refresh/route.ts': {
    call: /hashDeviceRefreshToken\s*\(/,
    reason: 'The principal is the device refresh token in the body, matched by its hash.',
  },
  'auth/device/token/route.ts': {
    call: /\bdevice_code\b/,
    reason: 'RFC 8628 polling: the principal is the unguessable device code in the body.',
  },
  'device/poll/route.ts': {
    call: /timingSafeEqual\s*\(/,
    reason: 'The device poll proves its code in the body with a constant-time comparison.',
  },
  'code/sessions/[sessionId]/provider-proxy/[...path]/route.ts': {
    call: /verifyProviderProxyToken\s*\(/,
    reason: 'A sandbox presents a signed provider proxy token as its bearer, never a cookie.',
  },
  'github/webhook/route.ts': {
    call: /verifyGitHubWebhookSignature\s*\(/,
    reason: 'GitHub signs the payload; there is no browser and no cookie principal.',
  },
  'llm/v1/chat/completions/resume-device/route.ts': {
    call: BEARER_GATE,
    reason: 'runAuthGate refuses any request without a Bearer header before identity resolves.',
  },
  'llm/v1/chat/completions/resume-input/route.ts': {
    call: BEARER_GATE,
    reason: 'runAuthGate refuses any request without a Bearer header before identity resolves.',
  },
  'llm/v1/chat/completions/route.ts': {
    call: BEARER_GATE,
    reason: 'runAuthGate refuses any request without a Bearer header before identity resolves.',
  },
  'llm/v1/chat/completions/runs/[runId]/resume/route.ts': {
    call: BEARER_GATE,
    reason: 'runAuthGate refuses any request without a Bearer header before identity resolves.',
  },
  'llm/v1/route/preview/route.ts': {
    call: BEARER_GATE,
    reason: 'runAuthGate refuses any request without a Bearer header before identity resolves.',
  },
  'media/video/openrouter-webhook/route.ts': {
    call: /verifyOpenRouterVideoWebhook\s*\(/,
    reason: 'The provider signs the callback; no user session is involved.',
  },
  'mobile/iap/apple-notifications/route.ts': {
    call: /verifyAppleStoreNotification\s*\(/,
    reason: 'Apple signs the server notification; no user session is involved.',
  },
  'mobile/iap/google-notifications/route.ts': {
    call: /verifyGooglePubSubPushIdentity\s*\(/,
    reason: 'Google Pub/Sub presents a signed push identity token; no user session is involved.',
  },
  'scim/v2/Groups/[groupId]/route.ts': {
    call: /withScim\s*\(/,
    reason: 'The identity provider authenticates with its SCIM bearer token.',
  },
  'scim/v2/Groups/route.ts': {
    call: /withScim\s*\(/,
    reason: 'The identity provider authenticates with its SCIM bearer token.',
  },
  'scim/v2/Users/[userId]/route.ts': {
    call: /withScim\s*\(/,
    reason: 'The identity provider authenticates with its SCIM bearer token.',
  },
  'scim/v2/Users/route.ts': {
    call: /withScim\s*\(/,
    reason: 'The identity provider authenticates with its SCIM bearer token.',
  },
  'webhooks/connectors/[triggerId]/route.ts': {
    call: /verifyConnectorTriggerSignature\s*\(/,
    reason: 'The sender signs the trigger payload with the trigger secret.',
  },
  'webhooks/gmail/route.ts': {
    call: /verifyGooglePubSubPushIdentity\s*\(/,
    reason: 'Google Pub/Sub presents a signed push identity token; no user session is involved.',
  },
  'webhooks/google-calendar/route.ts': {
    call: /verifyGoogleCalendarChannelToken\s*\(/,
    reason: 'Google echoes the channel token this app issued for the watch.',
  },
  'webhooks/slack/route.ts': {
    call: /verifySlackSignature\s*\(/,
    reason: 'Slack signs the request with the app signing secret.',
  },
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

  it('every mutating route verifies a CSRF token or has no cookie principal at all', () => {
    const unaccounted: string[] = [];
    const principalMissing: string[] = [];
    const cookieWithoutBearerGate: string[] = [];

    for (const file of files) {
      const rel = path.relative(API_ROOT, file).split(path.sep).join('/');
      const src = fs.readFileSync(file, 'utf8');

      if (!MUTATING.test(src)) continue;
      if (CSRF.test(src) || RETIRED.test(src) || rel in EXEMPT) continue;

      const principal = NON_COOKIE_PRINCIPAL[rel];
      if (!principal) {
        unaccounted.push(rel);
        continue;
      }
      if (!principal.call.test(src)) principalMissing.push(rel);
      if (COOKIE_RESOLVER.test(src) && !BEARER_GATE.test(src)) cookieWithoutBearerGate.push(rel);
    }

    expect(
      unaccounted,
      'these routes change state with no CSRF check and no recorded non-cookie principal',
    ).toEqual([]);
    expect(principalMissing, 'the principal these routes are recorded under is gone').toEqual([]);
    expect(
      cookieWithoutBearerGate,
      'these routes resolve a cookie principal without first requiring a Bearer header',
    ).toEqual([]);
  });

  it('keeps the non-cookie principal list to routes that exist and still need it', () => {
    for (const rel of Object.keys(NON_COOKIE_PRINCIPAL)) {
      const full = path.join(API_ROOT, rel);
      expect(fs.existsSync(full), `stale principal entry: ${rel}`).toBe(true);
      const src = fs.readFileSync(full, 'utf8');
      expect(CSRF.test(src), `${rel} now checks CSRF; drop its principal entry`).toBe(false);
    }
  });

  it('keeps the exemption list honest', () => {
    for (const [rel, reason] of Object.entries(EXEMPT)) {
      const full = path.join(API_ROOT, rel);
      expect(fs.existsSync(full), `stale CSRF exemption: ${rel}`).toBe(true);
      expect(reason.length, `exemption for ${rel} needs a real reason`).toBeGreaterThan(30);
    }
  });
});
