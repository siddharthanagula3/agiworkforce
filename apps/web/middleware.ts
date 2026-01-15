import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

/**
 * Security-enhanced middleware for AGI Workforce web application.
 * Handles authentication, session management, and security headers.
 */

// Rate limiting tracking for brute-force protection
// Note: This is per-instance and won't work across serverless instances
// For production distributed rate limiting, use the rate-limit.ts with Redis
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
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

  // Reset if outside window
  if (now - record.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return true;
  }

  // Check if exceeded
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    return false;
  }

  // Increment
  record.count++;
  return true;
}

// Periodic cleanup of old entries (runs on each request, but only cleans occasionally)
let lastCleanup = Date.now();
function cleanupOldEntries(): void {
  const now = Date.now();
  if (now - lastCleanup < 60000) return; // Only clean every minute

  const expiredTime = now - LOGIN_WINDOW_MS;
  for (const [ip, record] of loginAttempts.entries()) {
    if (record.firstAttempt < expiredTime) {
      loginAttempts.delete(ip);
    }
  }
  lastCleanup = now;
}

export async function middleware(request: NextRequest) {
  // Periodic cleanup
  cleanupOldEntries();

  // Block access to sensitive paths
  const blockedPaths = [
    '/.env',
    '/.git',
    '/wp-admin',
    '/wp-login',
    '/xmlrpc.php',
    '/admin',
    '/.htaccess',
    '/.well-known/security.txt',
  ];

  const pathname = request.nextUrl.pathname.toLowerCase();
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
        JSON.stringify({
          error: 'Too many login attempts. Please try again later.',
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '900', // 15 minutes
          },
        },
      );
    }
  }

  // Update Supabase session
  const response = await updateSession(request);

  // Add security headers to all responses
  // Note: Most headers are set in next.config.ts, but we add request-specific ones here
  response.headers.set('X-Request-ID', crypto.randomUUID());

  // Prevent caching of authenticated pages
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  // Add CSRF protection headers for state-changing endpoints
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');

    // Validate origin matches host for same-origin requests
    // Allow requests without origin (same-origin navigation)
    if (origin && host) {
      const originUrl = new URL(origin);
      const expectedHost = host.split(':')[0]; // Remove port if present

      // Check if origin matches expected hosts
      const allowedOrigins = [
        expectedHost,
        'localhost',
        'agiworkforce.com',
        'www.agiworkforce.com',
      ];

      if (
        !allowedOrigins.some(
          (allowed) => originUrl.hostname === allowed || originUrl.hostname.endsWith(`.${allowed}`),
        )
      ) {
        return new NextResponse('Forbidden - Invalid Origin', { status: 403 });
      }
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
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
