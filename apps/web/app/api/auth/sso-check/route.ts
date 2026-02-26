import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logger.error({}, 'Supabase service role not configured for SSO check');
    return NextResponse.json({ ssoEnabled: false });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from('sso_connections')
      .select('id')
      .eq('domain', domain.toLowerCase())
      .eq('is_active', true)
      .limit(1);

    if (error) {
      // Log internally but do not expose error details to the client
      logger.error({ error, domain }, 'SSO domain check query failed');
      return NextResponse.json({ ssoEnabled: false });
    }

    return NextResponse.json({ ssoEnabled: data !== null && data.length > 0 });
  } catch (error) {
    logger.error({ error, domain }, 'Unexpected error during SSO domain check');
    return NextResponse.json({ ssoEnabled: false });
  }
}
