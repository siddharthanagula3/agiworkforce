import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const errorUrl = new URL('/auth/error', request.url);
  errorUrl.searchParams.set('error', 'auth_route_removed');
  errorUrl.searchParams.set(
    'error_description',
    'This sign-in callback has been retired. Please use the main login page.',
  );

  return NextResponse.redirect(errorUrl, { status: 307 });
}
