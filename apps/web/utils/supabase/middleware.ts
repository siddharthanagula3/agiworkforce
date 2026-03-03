import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

  // Avoid hard-crashing middleware when env is misconfigured.
  // This file may be imported by Next.js middleware; fail-open is preferable to a global outage.
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[middleware] Missing Supabase env vars; skipping session update.');
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected routes that require authentication
  const protectedPaths = [
    '/dashboard',
    '/chat',
    '/settings',
    '/billing',
    '/api/llm',
    '/api/checkout',
    '/api/portal',
    '/api/agents',
  ];
  const isProtectedPath = protectedPaths.some((path) => request.nextUrl.pathname.startsWith(path));

  // Public paths that don't require authentication
  const publicPaths = [
    '/',
    '/login',
    '/signup',
    '/auth',
    '/pricing',
    '/forgot-password',
    '/api/stripe-webhook',
    '/api/health',
  ];
  const isPublicPath = publicPaths.some(
    (path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(path + '/'),
  );

  if (!user && isProtectedPath && !isPublicPath) {
    // API routes that use Bearer token auth (e.g. desktop app, CLI) must NOT be
    // redirected to /login — they send Authorization: Bearer <JWT> and the route
    // handler validates it directly.  A redirect returns HTML which breaks JSON
    // clients.  Pass through; the route handler will return 401 if the token is
    // missing or invalid.
    const isApiRoute = request.nextUrl.pathname.startsWith('/api/');
    const hasBearer = request.headers.get('authorization')?.startsWith('Bearer ');
    if (isApiRoute && hasBearer) {
      return supabaseResponse;
    }

    // Browser navigation to protected pages: redirect to login
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Kill-switch: reject suspended/banned/disabled users on protected paths.
  // This enforces account_status immediately without waiting for token expiry.
  if (user && isProtectedPath && !isPublicPath) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_status')
      .eq('id', user.id)
      .single();

    if (profile?.account_status && profile.account_status !== 'active') {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('reason', profile.account_status);
      const redirectResponse = NextResponse.redirect(url);
      // Copy Supabase cookies to maintain cookie state
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie);
      });
      return redirectResponse;
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new Response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
