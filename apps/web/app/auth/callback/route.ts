import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../services/supabase-server';
import { getSafeRedirectUrl } from '@/lib/safe-redirect';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const next = requestUrl.searchParams.get('next');
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

    return NextResponse.redirect(new URL(safeRedirectPath, requestUrl.origin));
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
