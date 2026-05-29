import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';

/**
 * SSO Domain Check API
 *
 * GET /api/auth/sso-check?domain=acme.com
 *
 * Returns whether SSO is enabled for the given email domain.
 * Used by the login page to show the "Sign in with SSO" button.
 *
 * Rate limited to prevent domain enumeration.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Rate limit: 10 checks per minute per IP to prevent domain enumeration
  // Uses 'auth-verify' config (10 requests per minute, fail-closed).
  const rateLimitResponse = await withRateLimit(request, 'auth-verify');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const domain = request.nextUrl.searchParams.get('domain');

  if (!domain) {
    return NextResponse.json({ ssoEnabled: false });
  }

  // Reject any non-ASCII characters first to block homograph/IDN attacks
  if (/[^a-zA-Z0-9.-]/.test(domain)) {
    return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 });
  }

  // Basic domain validation to prevent injection
  const domainPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
  if (!domainPattern.test(domain)) {
    return NextResponse.json({ ssoEnabled: false });
  }

  try {
    const db = getNeonDb();
    const rows = await db.query<{ id: string }>(
      'SELECT id FROM sso_connections WHERE domain = $1 AND is_active = true LIMIT 1',
      [domain.toLowerCase()],
    );

    return NextResponse.json({ ssoEnabled: rows.length > 0 });
  } catch (error) {
    logger.error({ error, domain }, 'Unexpected error during SSO domain check');
    return NextResponse.json({ ssoEnabled: false });
  }
}
