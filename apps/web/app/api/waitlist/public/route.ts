import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNeonDb } from '@/lib/server/neon-db';
import { normalizeWaitlistEmail } from '@/lib/server/waitlist-email';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import {
  WAITLIST_CONSENT_PURPOSES,
  isConsentPurpose,
  recordConsentBatch,
  type ConsentDecision,
  type ConsentSurface,
} from '@/lib/server/consent-records';

/**
 * POST /api/waitlist/public
 *
 * Anonymous early-access signup for AGI Team & Enterprise and higher-capacity
 * plans, used by the public marketing site (waitlist modal, hero CTAs, pricing
 * early-access rows). Managed cloud itself is public-alpha-open, not gated.
 * Persists to the `cloud_managed_waitlist` table (see apps/web/db/neon/),
 * which allows a null user_id for explicitly anonymous records
 * (migration 0034).
 *
 * Unlike /api/waitlist/cloud-managed this route does NOT require a signed-in
 * user: visitors give their email precisely because they do not have an
 * account relationship yet. When a Clerk session does exist, the user id is
 * attached so launch ops can distinguish customer interest from anonymous
 * public-interest signups.
 *
 * Body: {
 *   email: string,
 *   source?: 'website' | 'byok' | 'sync' | 'billing' | 'mobile' | 'other',
 *   consent: { purpose: string, granted: boolean }[],
 *   consentSurface: 'web-waitlist-inline' | 'web-waitlist-modal',
 * }
 *
 * Fails closed if persistence is unavailable; waitlist signups must never be
 * acknowledged without durable storage.
 *
 * CONSENT (DPDP s.6) — this is the product's largest unconsented intake: a
 * visitor's plaintext email address, with no account and no prior relationship,
 * stored indefinitely. Before this change the route took the address on the
 * strength of a submit button and a line of fine print. It now refuses the
 * write unless the request carries an explicit decision for the purpose that
 * makes storing the address lawful, and it records every decision — including
 * the optional box left unticked — before the address is written.
 *
 * ORDER MATTERS: the consent row is written FIRST. If the address were stored
 * first and the ledger write then failed, the product would hold personal data
 * it could not show consent for, which is the exact position the Act penalises.
 * The reverse failure is harmless: a consent row with no waitlist row records a
 * decision about data that was never stored.
 */

type PublicWaitlistSource = 'website' | 'byok' | 'sync' | 'billing' | 'mobile' | 'other';

const VALID_SOURCES = new Set<PublicWaitlistSource>([
  'website',
  'byok',
  'sync',
  'billing',
  'mobile',
  'other',
]);

function isValidSource(value: unknown): value is PublicWaitlistSource {
  return typeof value === 'string' && VALID_SOURCES.has(value as PublicWaitlistSource);
}

function isValidEmail(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

const WAITLIST_CONSENT_SURFACES = new Set<ConsentSurface>([
  'web-waitlist-inline',
  'web-waitlist-modal',
]);

function isWaitlistConsentSurface(value: unknown): value is ConsentSurface {
  return typeof value === 'string' && WAITLIST_CONSENT_SURFACES.has(value as ConsentSurface);
}

/**
 * Read the consent array off an untrusted body.
 *
 * Unknown purposes are dropped rather than stored: a client that invents a
 * purpose key must not be able to write a row the notice page cannot describe.
 * A duplicated purpose is a contradiction the server cannot resolve, so it is
 * rejected outright rather than resolved by last-write-wins.
 */
function parseConsentDecisions(value: unknown): ConsentDecision[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const decisions: ConsentDecision[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { purpose, granted } = entry as { purpose?: unknown; granted?: unknown };
    if (!isConsentPurpose(purpose) || typeof granted !== 'boolean') continue;
    if (seen.has(purpose)) {
      throw createError.validation(`Conflicting consent decisions for ${purpose}`);
    }
    seen.add(purpose);
    decisions.push({ purpose, granted });
  }
  return decisions;
}

async function getOptionalUserId(): Promise<string | null> {
  try {
    const { userId } = await auth();
    return userId ?? null;
  } catch {
    // auth() throws outside Clerk middleware context (e.g. some test
    // harnesses). Anonymous capture must keep working regardless.
    return null;
  }
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  // Same dedicated 'waitlist' rate limit as the account-bound route:
  // 5/hour per IP, fail-closed. Public PII intake warrants the tight limit.
  const rateLimitResponse = await withRateLimit(request, 'waitlist');
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  const payload = body as {
    email?: unknown;
    source?: unknown;
    consent?: unknown;
    consentSurface?: unknown;
  };

  if (!isValidEmail(payload.email)) {
    throw createError.validation('A valid email address is required');
  }

  const source: PublicWaitlistSource = isValidSource(payload.source) ? payload.source : 'website';
  const email = normalizeWaitlistEmail(payload.email as string);

  const consentSurface: ConsentSurface = isWaitlistConsentSurface(payload.consentSurface)
    ? payload.consentSurface
    : 'web-waitlist-inline';
  const decisions = parseConsentDecisions(payload.consent);

  // Every purpose the form shows must come back with a decision. A purpose that
  // is simply absent is the ambiguous case the Act does not allow: it cannot be
  // told apart from a client that dropped the field, so it is not treated as a
  // refusal — the request is refused instead.
  const decided = new Set(decisions.map((decision) => decision.purpose));
  const undecided = WAITLIST_CONSENT_PURPOSES.filter((purpose) => !decided.has(purpose.id));
  if (undecided.length > 0) {
    throw createError.validation(
      `A consent decision is required for: ${undecided.map((purpose) => purpose.id).join(', ')}`,
    );
  }

  // The purpose that makes storing the address lawful. Refusing it is a valid
  // answer — it just means there is nothing to store, so nothing is stored.
  const refusedRequired = WAITLIST_CONSENT_PURPOSES.filter(
    (purpose) =>
      purpose.necessaryForRequest &&
      !decisions.some((decision) => decision.purpose === purpose.id && decision.granted),
  );
  if (refusedRequired.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'CONSENT_REQUIRED',
          message:
            'We can only store your email address if you agree to it being stored for the early-access list.',
        },
      },
      { status: 400 },
    );
  }

  const userId = await getOptionalUserId();
  const db = getNeonDb();
  const now = new Date().toISOString();

  // Consent before collection — see the header comment on why this order is not
  // interchangeable. A failure here aborts the signup; it is never swallowed.
  try {
    await recordConsentBatch(
      userId ? { kind: 'user', userId } : { kind: 'email', email },
      decisions,
      consentSurface,
    );
  } catch (err) {
    console.warn('[waitlist/public] Consent ledger unavailable; refusing signup.', { source });
    if (err && typeof err === 'object' && 'status' in err) throw err;
    throw createError.internal('Consent could not be recorded, so nothing was stored');
  }

  try {
    await db.execute(
      `insert into cloud_managed_waitlist (user_id, email, source, joined_at, updated_at)
       values ($1, $2, $3, $4, $5)
       on conflict (email, source)
       do update set
         user_id = coalesce(excluded.user_id, cloud_managed_waitlist.user_id),
         updated_at = excluded.updated_at`,
      [userId, email, source, now, now],
    );
    return NextResponse.json({ ok: true, joined: true });
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr?.code === '42P01') {
      console.warn('[waitlist/public] Table not yet migrated; refusing signup.', { source });
      throw createError.internal('Cloud waitlist storage is not migrated');
    }
    // Re-throw AppErrors (rate limit, CSRF, etc.) as-is
    if (err && typeof err === 'object' && 'status' in err) throw err;
    console.warn('[waitlist/public] DB unreachable; refusing signup.', { source });
    throw createError.internal('Cloud waitlist storage is unavailable');
  }
}

export const POST = withErrorHandler(handlePost);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
