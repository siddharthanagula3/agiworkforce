import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

/**
 * Build a per-request Content-Security-Policy string with a nonce.
 *
 * The nonce replaces 'unsafe-inline' in script-src, preventing arbitrary
 * inline script injection.
 *
 * NOTE on style-src 'unsafe-inline': Removing it would require adding nonce
 * attributes to every <style> tag and CSS-in-JS injection point. Tailwind CSS,
 * Radix UI, and ~28 components use inline `style=` attributes which would all
 * break without 'unsafe-inline'. Migrating to nonce-based styles is tracked
 * but non-trivial — leave as-is until a framework-level solution exists.
 */
function buildCspWithNonce(nonce: string): string {
  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' https://js.stripe.com https://challenges.cloudflare.com https://www.googletagmanager.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://js.stripe.com;
    img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://lh3.googleusercontent.com https://avatars.githubusercontent.com https://stripe.com https://www.google-analytics.com;
    font-src 'self' https://fonts.gstatic.com https://js.stripe.com data:;
    connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://vitals.vercel-insights.com https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com;
    frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com;
    frame-ancestors 'none';
    form-action 'self';
    base-uri 'self';
    object-src 'none';
    upgrade-insecure-requests;
    block-all-mixed-content;
  `
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export async function middleware(request: NextRequest) {
  // Run Supabase session refresh and auth-gating first (may return a redirect)
  const supabaseResponse = await updateSession(request);

  // If Supabase returned a redirect (e.g., unauthenticated → /login), pass it through
  if (supabaseResponse.headers.get('location')) {
    return supabaseResponse;
  }

  // Generate a cryptographically-secure per-request nonce
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCspWithNonce(nonce);

  // Forward nonce to Server Components via request header (readable via next/headers)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  // Create new pass-through response with the modified request headers
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Copy Supabase session cookies so the auth state is not lost
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });

  // Set nonce-based CSP on the response
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on all routes except static files and Next.js internals.
     * This follows Supabase's recommended middleware matcher.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
