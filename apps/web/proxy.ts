import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getEnv } from './utils/env';
import { logger } from './lib/logger';

// Rate limiting tracking for brute-force protection
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return true;
  }

  if (now - record.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return true;
  }

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    return false;
  }

  record.count++;
  return true;
}

// Periodic cleanup of old entries
let lastCleanup = Date.now();
function cleanupOldEntries(): void {
  const now = Date.now();
  if (now - lastCleanup < 60000) return;

  const expiredTime = now - LOGIN_WINDOW_MS;
  for (const [ip, record] of loginAttempts.entries()) {
    if (record.firstAttempt < expiredTime) {
      loginAttempts.delete(ip);
    }
  }
  lastCleanup = now;
}

/**
 * Proxy for request-level authentication, authorization, and security checks.
 * Validates:
 * - Security: Blocked paths, path traversal, login rate limiting
 * - User session (Supabase authentication)
 * - Active subscription status
 * - Subscription grace period (7 days past due)
 */
export async function proxy(request: NextRequest) {
  // Periodic cleanup
  cleanupOldEntries();

  const pathname = request.nextUrl.pathname.toLowerCase();

  // Block access to sensitive paths
  const blockedPaths = [
    '/.env',
    '/.git',
    '/wp-admin',
    '/wp-login',
    '/xmlrpc.php',
    '/admin',
    '/.htaccess',
  ];

  if (blockedPaths.some((blocked) => pathname.startsWith(blocked))) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // Check for path traversal attempts
  if (pathname.includes('..') || pathname.includes('%2e%2e')) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  // Rate limit login attempts
  if (pathname === '/login' && request.method === 'POST') {
    const ip = getClientIp(request);
    if (!checkLoginRateLimit(ip)) {
      return new NextResponse(
        JSON.stringify({ error: 'Too many login attempts. Please try again later.' }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '900' },
        },
      );
    }
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Add security headers
  response.headers.set('X-Request-ID', crypto.randomUUID());

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

    // Use getUser() instead of getSession() to ensure proper session refresh
    // and cookie updates (important for Next.js 16 proxy pattern)
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('redirectTo', request.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status, plan_tier, current_period_end')
      .eq('user_id', user.id)
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
