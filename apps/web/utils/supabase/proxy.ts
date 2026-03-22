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

  // Avoid hard-crashing proxy when env is misconfigured.
  // This file may be imported by Next.js proxy; fail-open is preferable to a global outage.
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[proxy] Missing Supabase env vars; skipping session update.');
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
    '/chat',
    '/device-auth',
    '/settings',
    '/billing',
    '/api/llm',
    '/api/checkout',
    '/api/portal',
    '/api/agents',
  ];
  const isProtectedPath = protectedPaths.some((path) => request.nextUrl.pathname.startsWith(path));

  // Auth routes that authenticated users should be redirected away from
  const authOnlyPaths = ['/login', '/signup'];
  const isAuthOnlyPath = authOnlyPaths.some((path) => request.nextUrl.pathname === path);

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
    '/share',
    '/verify',
  ];
  const isPublicPath = publicPaths.some(
    (path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(path + '/'),
  );

  // Redirect authenticated users away from login/signup to dashboard
  if (user && isAuthOnlyPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/chat';
    const redirectResponse = NextResponse.redirect(url);
    // Preserve session cookies on the redirect response
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  if (!user && isProtectedPath && !isPublicPath) {
    // API routes must NEVER redirect to an HTML login page — fetch() follows
    // redirects automatically, turning the HTML response into a JSON parse error
    // on the client ("Unexpected token '<', <!DOCTYPE...").
    // Return 401 JSON so callers can handle unauthenticated requests properly.
    const isApiRoute = request.nextUrl.pathname.startsWith('/api/');
    if (isApiRoute) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 },
      );
    }

    // Browser navigation to protected pages: redirect to login
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Kill-switch: reject suspended/banned/disabled users on protected paths.
  // This enforces account_status immediately without waiting for token expiry.
  // Uses service role client to bypass RLS restrictions on the profiles table.
  if (user && isProtectedPath && !isPublicPath) {
    try {
      const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
      if (serviceRoleKey && supabaseUrl) {
        const { createClient } = await import('@supabase/supabase-js');
        const adminClient = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false },
        });

        const { data: profile } = await adminClient
          .from('profiles')
          .select('account_status')
          .eq('id', user.id)
          .maybeSingle();

        if (profile?.account_status && profile.account_status !== 'active') {
          const url = request.nextUrl.clone();
          url.pathname = '/login';
          // Use generic error params instead of leaking the exact account status
          url.searchParams.set('error', 'account_suspended');
          url.searchParams.set(
            'error_description',
            profile.account_status === 'banned'
              ? 'Your account has been permanently suspended. Please contact support.'
              : 'Your account has been temporarily suspended. Please contact support.',
          );

          const redirectResponse = NextResponse.redirect(url);

          // Clear Supabase auth cookies to force re-authentication
          // and prevent suspended users from accessing other pages
          const cookieNames = request.cookies.getAll().map((c) => c.name);
          for (const name of cookieNames) {
            if (name.startsWith('sb-') || name.includes('supabase')) {
              redirectResponse.cookies.set(name, '', { maxAge: 0, path: '/' });
            }
          }

          return redirectResponse;
        }
      }
    } catch {
      // If account status check fails, allow through rather than blocking
      // all authenticated users. Individual API routes have their own auth.
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
