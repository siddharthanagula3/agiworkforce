import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getEnv } from './utils/env';
import { logger } from './lib/logger';

/**
 * Proxy for request-level authentication and authorization checks.
 * Validates:
 * - User session (Supabase authentication)
 * - Active subscription status
 * - Subscription grace period (7 days past due)
 *
 * This uses Next.js proxy convention which is appropriate for
 * request-level security checks that must run on every request.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const protectedRoutes = ['/dashboard', '/download'];
  const protectedApiRoutes = ['/api/download', '/api/download-beta', '/api/portal'];
  const isProtectedRoute = protectedRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route),
  );
  const isProtectedApiRoute = protectedApiRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route),
  );

  const publicRoutes = ['/login', '/signup', '/pricing', '/'];
  const publicApiRoutes = ['/api/checkout', '/api/claim-offer', '/api/stripe-webhook'];
  const isPublicRoute = publicRoutes.some((route) => request.nextUrl.pathname.startsWith(route));
  const isPublicApiRoute = publicApiRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route),
  );

  if (isPublicRoute || isPublicApiRoute) {
    return response;
  }

  if (request.nextUrl.pathname.startsWith('/api/') && !isProtectedApiRoute) {
    return response;
  }

  if (isProtectedRoute || isProtectedApiRoute) {
    // Safe environment variable access with fallbacks
    const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const supabaseAnonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    // If required env vars are missing, allow request through but log error
    // This prevents proxy from breaking the entire app
    if (!supabaseUrl || !supabaseAnonKey) {
      logger.error('Missing Supabase environment variables. Authentication check skipped.');
      return response;
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce', // Use PKCE flow for enhanced security
      },
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('redirectTo', request.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status, plan_tier, current_period_end')
      .eq('user_id', session.user.id)
      .maybeSingle();

    const activeStatuses = ['active', 'trialing'];
    const allowedTiers = ['hobby', 'pro', 'max', 'enterprise'];
    const GRACE_PERIOD_DAYS = 7;

    const now = Math.floor(Date.now() / 1000);
    const isPastDueGrace =
      subscription?.status === 'past_due' &&
      subscription.current_period_end &&
      now <
        new Date(subscription.current_period_end).getTime() / 1000 +
          GRACE_PERIOD_DAYS * 24 * 60 * 60;

    const hasActiveSubscription =
      subscription &&
      (activeStatuses.includes(subscription.status) || isPastDueGrace) &&
      allowedTiers.includes(subscription.plan_tier);

    if (!hasActiveSubscription) {
      const redirectUrl = new URL('/pricing', request.url);
      redirectUrl.searchParams.set('reason', 'subscription_required');
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
