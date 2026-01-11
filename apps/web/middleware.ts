import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  // Create a response object to modify
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Protected routes that require authentication AND active subscription
  const protectedRoutes = ['/dashboard', '/download'];
  const protectedApiRoutes = ['/api/download', '/api/download-beta', '/api/portal'];
  const isProtectedRoute = protectedRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route),
  );
  const isProtectedApiRoute = protectedApiRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route),
  );

  // Public routes that don't require subscription
  const publicRoutes = ['/login', '/signup', '/pricing', '/'];
  const publicApiRoutes = ['/api/checkout', '/api/claim-offer', '/api/stripe-webhook'];
  const isPublicRoute = publicRoutes.some((route) => request.nextUrl.pathname.startsWith(route));
  const isPublicApiRoute = publicApiRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route),
  );

  // Skip middleware for public routes
  if (isPublicRoute || isPublicApiRoute) {
    return response;
  }

  // Skip middleware for other API routes (not in protected list)
  if (request.nextUrl.pathname.startsWith('/api/') && !isProtectedApiRoute) {
    return response;
  }

  // Check authentication and subscription for protected routes (pages and APIs)
  if (isProtectedRoute || isProtectedApiRoute) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
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
      },
    );

    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Redirect to login if not authenticated
    if (!session) {
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('redirectTo', request.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // Check subscription status
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status, plan_tier, current_period_end')
      .eq('user_id', session.user.id)
      .maybeSingle();

    // Active subscription statuses
    const activeStatuses = ['active', 'trialing'];
    const allowedTiers = ['hobby', 'pro', 'max', 'enterprise'];
    const GRACE_PERIOD_DAYS = 7;

    // Check for grace period on past_due subscriptions
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

    // Redirect to pricing if no active subscription
    if (!hasActiveSubscription) {
      const redirectUrl = new URL('/pricing', request.url);
      redirectUrl.searchParams.set('reason', 'subscription_required');
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
