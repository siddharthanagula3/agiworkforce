import { NextRequest, NextResponse } from 'next/server';

/**
 * This retired OAuth callback route is no longer active.
 * Authentication is now handled by Clerk. Any OAuth codes sent here
 * are against the wrong auth backend and must not be exchanged.
 *
 * Redirect to the visible auth error page so old links fail clearly without
 * leaving a raw JSON error page in browser sessions.
 */
export async function GET(request: NextRequest) {
  const errorUrl = new URL('/auth/error', request.url);
  errorUrl.searchParams.set('error', 'auth_route_removed');
  errorUrl.searchParams.set(
    'error_description',
    'This sign-in callback has been retired. Please use the main login page.',
  );

  return NextResponse.redirect(errorUrl, { status: 307 });
}
