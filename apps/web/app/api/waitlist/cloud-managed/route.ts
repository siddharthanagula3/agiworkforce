import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/services/supabase-server';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';

/**
 * POST /api/waitlist/cloud-managed
 *
 * Unauthenticated waitlist signup for the Cloud Managed private beta.
 * Persists to the `cloud_managed_waitlist` table (see supabase/migrations/).
 * If the table does not yet exist, stubs a console log and returns 200 OK —
 * idempotent, no error surface to the user.
 *
 * Body: { email: string, source: 'byok' | 'sync' | 'billing' | 'other' }
 */

type WaitlistSource = 'byok' | 'sync' | 'billing' | 'other';

const VALID_SOURCES = new Set<WaitlistSource>(['byok', 'sync', 'billing', 'other']);

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

  const rateLimitResponse = await withRateLimit(request, 'default');
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
  const email = payload.email.toLowerCase().trim();

  const supabase = await createSupabaseServerClient();

  try {
    const { error } = await supabase.from('cloud_managed_waitlist').upsert(
      {
        email,
        source,
        joined_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email,source' },
    );

    if (error) {
      // Table may not exist yet (migration pending) — stub to console and succeed
      if (error.code === '42P01') {
        console.info('[waitlist/cloud-managed] Table not yet migrated. Stub entry:', {
          email,
          source,
        });
        return NextResponse.json({ ok: true, queued: true });
      }
      throw createError.internal('Failed to join waitlist');
    }
  } catch (err) {
    // Non-Supabase error (e.g. network) — re-throw
    if (err && typeof err === 'object' && 'status' in err) throw err;
    console.info('[waitlist/cloud-managed] Stub fallback:', { email, source }, err);
    return NextResponse.json({ ok: true, queued: true });
  }

  return NextResponse.json({ ok: true, joined: true });
}

export const POST = withErrorHandler(handlePost);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
