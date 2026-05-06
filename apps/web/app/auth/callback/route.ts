import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '../../../services/supabase-server';
import { getSafeRedirectUrl } from '@/lib/safe-redirect';
import { logger } from '@/lib/logger';

/** WEB-9 (audit 2026-05-03): cookie that stores the OAuth `state`
 *  nonce set when sign-in is initiated. Validated on the callback.
 *  Supabase's PKCE flow already covers code-injection, but state
 *  validation closes the cross-tab CSRF gap RFC 6749 §10.12 calls out. */
const OAUTH_STATE_COOKIE = 'agi_oauth_state';

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const next = requestUrl.searchParams.get('next');
    const stateParam = requestUrl.searchParams.get('state');
    const errorParam = requestUrl.searchParams.get('error');
    const errorDescription = requestUrl.searchParams.get('error_description');

    // Handle OAuth errors (e.g., user denied access)
    if (errorParam) {
      logger.error({ errorParam, errorDescription }, 'Auth callback received OAuth error');
      const errorUrl = new URL('/auth/error', requestUrl.origin);
      errorUrl.searchParams.set('error', errorParam);
      if (errorDescription) {
        errorUrl.searchParams.set('error_description', errorDescription);
      }
      return NextResponse.redirect(errorUrl);
    }

    // WEB-OAUTH-STATE-BYPASS fix (RFC 6749 §10.12): when a state cookie is
    // present the server initiated an OAuth flow that required state
    // validation. We MUST reject if stateParam is absent or mismatched.
    // The old guard (`stateParam && expectedState && ...`) allowed an
    // attacker to strip the ?state= query param, causing the check to
    // short-circuit even when the cookie was set.
    const cookieStore = await cookies();
    const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
    if (expectedState && (stateParam === null || stateParam !== expectedState)) {
      logger.error(
        { stateParamPresent: !!stateParam, expectedPresent: !!expectedState },
        'OAuth callback state mismatch - possible CSRF',
      );
      const errorUrl = new URL('/auth/error', requestUrl.origin);
      errorUrl.searchParams.set('error', 'state_mismatch');
      errorUrl.searchParams.set(
        'error_description',
        'Authentication state mismatch. Please retry sign-in from a fresh tab.',
      );
      return NextResponse.redirect(errorUrl);
    }

    // Validate and sanitize the redirect URL to prevent open redirect attacks
    const safeRedirectPath = getSafeRedirectUrl(next, requestUrl.origin, '/chat');

    if (code) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        // [H6 fix] Log full error server-side; only expose generic message to client
        logger.error({ error }, 'Auth code exchange failed');
        const errorUrl = new URL('/auth/error', requestUrl.origin);
        errorUrl.searchParams.set('error', 'invalid_token');
        errorUrl.searchParams.set('error_description', 'Authentication failed. Please try again.');
        return NextResponse.redirect(errorUrl);
      }
    }

    // WEB-9: clear the state cookie now that exchange has succeeded so
    // it can't be replayed on a second callback.
    const response = NextResponse.redirect(new URL(safeRedirectPath, requestUrl.origin));
    if (expectedState) {
      response.cookies.set(OAUTH_STATE_COOKIE, '', {
        maxAge: 0,
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
      });
    }
    return response;
  } catch (error) {
    const requestUrl = new URL(request.url);
    // [H6 fix] Log full error server-side only; never expose internal messages in redirect URLs
    logger.error({ error }, 'Auth callback unexpected error');

    const errorUrl = new URL('/auth/error', requestUrl.origin);
    errorUrl.searchParams.set('error', 'server_error');
    errorUrl.searchParams.set(
      'error_description',
      'An unexpected error occurred. Please try again.',
    );
    return NextResponse.redirect(errorUrl);
  }
}
