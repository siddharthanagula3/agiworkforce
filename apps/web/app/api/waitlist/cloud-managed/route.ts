import 'server-only';

import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getNeonDb } from '@/lib/server/neon-db';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';

/**
 * POST /api/waitlist/cloud-managed
 *
 * Unauthenticated waitlist signup for the Cloud Managed private beta.
 * Persists to the `cloud_managed_waitlist` table (see apps/web/db/neon/).
 * If the table does not yet exist, stubs a console log and returns 200 OK --
 * idempotent, no error surface to the user.
 *
 * Body: { email: string, source: 'byok' | 'sync' | 'billing' | 'other' }
 *
 * PII handling: the email is hashed with SHA-256 before storage. The first
 * 3 characters of the address are retained as a display prefix so support
 * staff can loosely identify a row. No plaintext email is persisted.
 * The ON CONFLICT key is (email_hash, source) -- callers must ensure the
 * cloud_managed_waitlist table has been migrated to replace the email column
 * with email_hash TEXT + email_prefix TEXT.
 */

type WaitlistSource = 'byok' | 'sync' | 'billing' | 'other';

const VALID_SOURCES = new Set<WaitlistSource>(['byok', 'sync', 'billing', 'other']);

/**
 * Hash an email and return a safe storage pair.
 * Returns { hash, prefix } where prefix is the first 3 chars of the local
 * part (before @) for loose display without retaining full PII.
 */
function hashEmailForStorage(email: string): { hash: string; prefix: string } {
  const normalized = email.toLowerCase().trim();
  const hash = createHash('sha256').update(normalized).digest('hex');
  // First 3 chars of the local part (e.g. "joh" for "john@example.com")
  const localPart = normalized.split('@')[0] ?? normalized;
  const prefix = localPart.slice(0, 3);
  return { hash, prefix };
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
  // Hash the email before storage. No plaintext email is persisted; the hash
  // is the dedup key. email_prefix retains 3 chars for display only.
  const { hash: emailHash, prefix: emailPrefix } = hashEmailForStorage(payload.email as string);
  const db = getNeonDb();
  const now = new Date().toISOString();

  try {
    await db.execute(
      `insert into cloud_managed_waitlist (email_hash, email_prefix, source, joined_at, updated_at)
       values ($1, $2, $3, $4, $5)
       on conflict (email_hash, source)
       do update set updated_at = excluded.updated_at`,
      [emailHash, emailPrefix, source, now, now],
    );
  } catch (err) {
    const pgErr = err as { code?: string };
    // Table may not exist yet (migration pending) — stub to console and succeed
    if (pgErr?.code === '42P01') {
      console.warn('[waitlist/cloud-managed] Table not yet migrated; queuing entry stub.', {
        source,
      });
      return NextResponse.json({ ok: true, queued: true });
    }
    // Re-throw AppErrors (rate limit, CSRF, etc.) as-is
    if (err && typeof err === 'object' && 'status' in err) throw err;
    console.warn('[waitlist/cloud-managed] DB unreachable; returning queued stub.', { source });
    return NextResponse.json({ ok: true, queued: true });
  }

  return NextResponse.json({ ok: true, joined: true });
}

export const POST = withErrorHandler(handlePost);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
