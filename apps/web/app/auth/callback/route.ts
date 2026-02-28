import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../services/supabase-server';
import { getSafeRedirectUrl } from '@/lib/safe-redirect';

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const next = requestUrl.searchParams.get('next');
    const errorParam = requestUrl.searchParams.get('error');
    const errorDescription = requestUrl.searchParams.get('error_description');

    // Handle OAuth errors (e.g., user denied access)
    if (errorParam) {
      console.error('Auth callback received error:', errorParam, errorDescription);
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
        console.error('Auth code exchange error:', error);
        const errorUrl = new URL('/auth/error', requestUrl.origin);
        errorUrl.searchParams.set('error', 'invalid_token');
        errorUrl.searchParams.set('error_description', error.message);
        return NextResponse.redirect(errorUrl);
      }
    }

    return NextResponse.redirect(new URL(safeRedirectPath, requestUrl.origin));
  } catch (error) {
    const requestUrl = new URL(request.url);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('Auth callback error:', error);

    const errorUrl = new URL('/auth/error', requestUrl.origin);
    errorUrl.searchParams.set('error', 'server_error');
    errorUrl.searchParams.set('error_description', errorMessage);
    return NextResponse.redirect(errorUrl);
  }
}
