import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getNeonDb } from '@/lib/server/neon-db';
import { normalizeWaitlistEmail } from '@/lib/server/waitlist-email';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { requireCurrentUserId } from '@/lib/server/neon-chat';

/**
 * POST /api/waitlist/cloud-managed
 *
 * Account-bound waitlist signup for the Cloud Managed private beta.
 * Persists to the `cloud_managed_waitlist` table (see apps/web/db/neon/).
 * Fails closed if persistence is unavailable; waitlist signups must never be
 * acknowledged without durable storage.
 *
 * Body: { email: string, source: 'byok' | 'sync' | 'billing' | 'other' }
 *
 * PII handling: this table stores normalized email addresses because launch
 * operations must be able to notify waitlisted visitors. The table is
 * insert-only for public callers and read-restricted to service/admin access
 * by the database policy.
 */

// 'mobile' is a SEPARATE list (the mobile local-only beta cloud-waitlist) that still
// rolls up into the countable cloud_managed_waitlist total — separate list via the
// `source` column, shared rollup via a count across all sources.
type WaitlistSource = 'byok' | 'sync' | 'billing' | 'mobile' | 'other';

const VALID_SOURCES = new Set<WaitlistSource>(['byok', 'sync', 'billing', 'mobile', 'other']);

interface WaitlistRankRow {
  rank: number | string | null;
}

function isValidSource(value: unknown): value is WaitlistSource {
  return typeof value === 'string' && VALID_SOURCES.has(value as WaitlistSource);
}

function isValidEmail(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  // Use the dedicated 'waitlist' rate limit key: 5/hour per IP, fail-closed.
  // The unauthenticated PII intake warrants a tighter limit than 'default'.
  const rateLimitResponse = await withRateLimit(request, 'waitlist');
  if (rateLimitResponse) return rateLimitResponse;

  const userId = await requireCurrentUserId();

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

  const source: WaitlistSource = isValidSource(payload.source) ? payload.source : 'other';
  const email = normalizeWaitlistEmail(payload.email as string);
  const db = getNeonDb();
  const now = new Date().toISOString();

  try {
    await db.execute(
      `insert into cloud_managed_waitlist (user_id, email, source, joined_at, updated_at)
       values ($1, $2, $3, $4, $5)
       on conflict (email, source)
       do update set
         user_id = excluded.user_id,
         updated_at = excluded.updated_at`,
      [userId, email, source, now, now],
    );
    const rankRows = await db.query<WaitlistRankRow>(
      'select greatest(count(*) - 1, 0)::int as rank from cloud_managed_waitlist',
      [],
    );
    const rank = Number(rankRows[0]?.rank ?? 0);
    return NextResponse.json({
      ok: true,
      joined: true,
      rank: Number.isFinite(rank) ? rank : 0,
    });
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr?.code === '42P01') {
      console.warn('[waitlist/cloud-managed] Table not yet migrated; refusing signup.', { source });
      throw createError.internal('Cloud waitlist storage is not migrated');
    }
    // Re-throw AppErrors (rate limit, CSRF, etc.) as-is
    if (err && typeof err === 'object' && 'status' in err) throw err;
    console.warn('[waitlist/cloud-managed] DB unreachable; refusing signup.', { source });
    throw createError.internal('Cloud waitlist storage is unavailable');
  }
}

export const POST = withErrorHandler(handlePost);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
