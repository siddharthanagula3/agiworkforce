import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

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
  // WEB-13 / WEB-20 (audit 2026-05-19): allow framing the artifact sandbox
  // origin so the cross-origin renderer at sandbox.agiworkforce.com can be
  // embedded by the chat UI. When NEXT_PUBLIC_SANDBOX_ORIGIN is unset the
  // parent falls back to a same-origin srcDoc iframe — no frame-src change
  // needed in that case ('self' already covers it).
  const sandboxOrigin = process.env['NEXT_PUBLIC_SANDBOX_ORIGIN']?.trim().replace(/\/+$/, '');
  const sandboxFrameSrc = sandboxOrigin ? ` ${sandboxOrigin}` : '';
  const devUnsafeEval = process.env['NODE_ENV'] === 'production' ? '' : " 'unsafe-eval'";
  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}'${devUnsafeEval} https://*.clerk.accounts.dev https://*.clerk.com https://js.stripe.com https://challenges.cloudflare.com https://www.googletagmanager.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://js.stripe.com;
    img-src 'self' data: blob: https://img.clerk.com https://lh3.googleusercontent.com https://avatars.githubusercontent.com https://stripe.com https://www.google-analytics.com;
    font-src 'self' https://fonts.gstatic.com https://js.stripe.com data:;
    connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://clerk-telemetry.com https://api.stripe.com https://vitals.vercel-insights.com https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com;
    worker-src 'self' blob:;
    frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com${sandboxFrameSrc};
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

export const proxy = clerkMiddleware((_auth, request: NextRequest) => {
  // Generate a cryptographically-secure per-request nonce
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCspWithNonce(nonce);

  // Forward nonce to Server Components via request header (readable via next/headers)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  // Create new pass-through response with the modified request headers
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Set nonce-based CSP on the response
  response.headers.set('Content-Security-Policy', csp);

  return response;
});

export const config = {
  matcher: [
    /*
     * Run on all routes except:
     * - static files and Next.js internals
     * - api/stripe-webhook — must read raw request body bytes for HMAC
     *   signature verification via stripe.webhooks.constructEvent. Even
     *   though Next.js proxy doesn't normally consume the body,
     *   auth/session handling touches request.headers and any future change
     *   that touches the body would silently break signature verification.
     *   Excluding the path is the defense-in-depth fix. (WEB-4 audit fix,
     *   2026-05-03; routes also retain `export const runtime = 'nodejs'`
     *   to ensure Stripe SDK HMAC works.)
     * - api/llm/v1/audio/transcriptions — multipart/form-data; same
     *   class of risk if proxy ever needs to inspect.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/stripe-webhook|api/llm/v1/audio|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
};
