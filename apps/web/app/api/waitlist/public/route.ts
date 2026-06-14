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

/**
 * POST /api/waitlist/public
 *
 * Anonymous waitlist signup for the AGI Cloud private beta, used by the
 * public marketing site (waitlist modal, hero CTAs, pricing waitlist rows).
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
 * Body: { email: string, source?: 'website' | 'byok' | 'sync' | 'billing' | 'mobile' | 'other' }
 *
 * Fails closed if persistence is unavailable; waitlist signups must never be
 * acknowledged without durable storage.
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

  const payload = body as { email?: unknown; source?: unknown };

  if (!isValidEmail(payload.email)) {
    throw createError.validation('A valid email address is required');
  }

  const source: PublicWaitlistSource = isValidSource(payload.source) ? payload.source : 'website';
  const email = normalizeWaitlistEmail(payload.email as string);
  const userId = await getOptionalUserId();
  const db = getNeonDb();
  const now = new Date().toISOString();

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
