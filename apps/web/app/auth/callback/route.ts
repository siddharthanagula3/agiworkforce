import { NextResponse } from 'next/server';

/**
 * This Supabase OAuth callback route is no longer active.
 * Authentication is now handled by Clerk. Any OAuth codes sent here
 * are against the wrong auth backend and must not be exchanged.
 *
 * Return 410 Gone so crawlers and bookmarked links get a permanent signal,
 * and so any code still pointing here fails visibly rather than silently.
 */
export async function GET() {
  return new NextResponse(
    JSON.stringify({
      error: 'auth_route_removed',
      message:
        'This authentication endpoint has been removed. Please sign in via the main login page.',
      login_url: '/login',
    }),
    {
      status: 410,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
