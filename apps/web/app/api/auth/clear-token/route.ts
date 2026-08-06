import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { requireCsrfToken } from '@/lib/csrf';
import { withRateLimit } from '@/lib/rate-limit';
import { getClerkAuthUser } from '@/lib/api-auth';
import { recordAuditEvent } from '@/lib/security-audit';

export async function POST(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'auth-login');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  // Resolve the signing-out principal BEFORE the cookies are dropped, so the
  // audit row is attributable. This route is intentionally reachable without a
  // usable session (signing out twice must still succeed), so an unresolvable
  // principal is not an error — the event is simply recorded unattributed.
  let userId: string | null = null;
  try {
    ({ userId } = await getClerkAuthUser(request));
  } catch {
    userId = null;
  }

  const cookieStore = await cookies();
  cookieStore.delete('agi_access_token');
  cookieStore.delete('agi_refresh_token');

  // Audit: sign-out. No token material is recorded — the cookies are already
  // gone and their values were never read.
  await recordAuditEvent({
    userId,
    eventType: 'logout',
    request,
    detail: { source: 'session_cookie', resourceType: 'session' },
  });

  return NextResponse.json({ ok: true });
}
