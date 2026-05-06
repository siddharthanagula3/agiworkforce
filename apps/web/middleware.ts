import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/utils/supabase/proxy';

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

// SEV-WEB-CRIT-1 fix (2026-05-05): file was previously named `proxy.ts` and
// exported `proxy()`. Next.js App Router only invokes a root file named
// exactly `middleware.ts` exporting a function named exactly `middleware`,
// so the entire CSP/session-refresh layer was silently inactive on every
// request. Renamed and re-exported. See docs/security/red-team-2026-05-04.md
// CRIT-1 for staging-validation checklist before promoting to production.
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
     * Run on all routes except:
     * - static files and Next.js internals (Supabase recommended pattern)
     * - api/stripe-webhook — must read raw request body bytes for HMAC
     *   signature verification via stripe.webhooks.constructEvent. Even
     *   though Next.js middleware doesn't normally consume the body,
     *   updateSession() touches request.headers and any future change
     *   that touches the body would silently break signature verification.
     *   Excluding the path is the defense-in-depth fix. (WEB-4 audit fix,
     *   2026-05-03; routes also retain `export const runtime = 'nodejs'`
     *   to ensure Stripe SDK HMAC works.)
     * - api/llm/v1/audio/transcriptions — multipart/form-data; same
     *   class of risk if middleware ever needs to inspect.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/stripe-webhook|api/llm/v1/audio|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
