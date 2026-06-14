import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import type { NextMiddleware, NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

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
    img-src 'self' data: blob: https:;
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

// Fallback CSP used only when the nonce-forwarding path throws (see
// buildCspResponse). It drops the per-request nonce and allows inline scripts so
// the framework bootstrap/hydration scripts are not blocked — strictly less
// secure than the nonce path, but it keeps the site rendering instead of 500ing
// the entire surface when the edge runtime rejects the nonce path.
function buildFallbackCsp(): string {
  const sandboxOrigin = process.env['NEXT_PUBLIC_SANDBOX_ORIGIN']?.trim().replace(/\/+$/, '');
  const sandboxFrameSrc = sandboxOrigin ? ` ${sandboxOrigin}` : '';
  const devUnsafeEval = process.env['NODE_ENV'] === 'production' ? '' : " 'unsafe-eval'";
  return `
    default-src 'self';
    script-src 'self' 'unsafe-inline'${devUnsafeEval} https://*.clerk.accounts.dev https://*.clerk.com https://js.stripe.com https://challenges.cloudflare.com https://www.googletagmanager.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://js.stripe.com;
    img-src 'self' data: blob: https:;
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

function buildCspResponse(request: NextRequest): NextResponse {
  try {
    // Generate a cryptographically-secure per-request nonce
    const nonce = btoa(crypto.randomUUID());
    const csp = buildCspWithNonce(nonce);

    // Forward nonce to Server Components via request header (readable via next/headers)
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('x-agi-pathname', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    // CRITICAL: Next.js reads the nonce from the Content-Security-Policy *request*
    // header to stamp it onto every framework-injected inline <script>. Without
    // this, the bootstrap/hydration scripts have no nonce and the response CSP
    // blocks them, breaking the page. (Next.js CSP guide — set CSP on both the
    // request and the response.)
    requestHeaders.set('Content-Security-Policy', csp);

    // Create new pass-through response with the modified request headers
    const response = NextResponse.next({ request: { headers: requestHeaders } });

    // Set nonce-based CSP on the response
    response.headers.set('Content-Security-Policy', csp);

    return response;
  } catch (error) {
    // RESILIENCE: a throwing CSP middleware must never take the whole surface
    // down. The nonce-forwarding path above 500'd every route on Vercel's edge
    // runtime (worked under local `next start`'s node runtime). Degrade to a
    // nonce-less CSP so the site keeps rendering, and surface the real error in
    // the logs + a response header so the root cause stays diagnosable.
    const err = error instanceof Error ? error : new Error(String(error));

    console.error('[proxy] buildCspResponse fell back to nonce-less CSP:', err.name, err.message);
    const response = NextResponse.next();
    response.headers.set('Content-Security-Policy', buildFallbackCsp());
    response.headers.set('x-agi-proxy-fallback', `${err.name}: ${err.message}`.slice(0, 200));
    return response;
  }
}

function hasBrowserSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(({ name }) => {
    return name === '__session' || name === '__client' || name.startsWith('__clerk');
  });
}

function buildSignedOutRedirect(request: NextRequest): NextResponse {
  const requestedPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const redirectUrl = new URL('/login', request.url);
  redirectUrl.searchParams.set('redirectTo', requestedPath);
  const response = NextResponse.redirect(redirectUrl);
  response.headers.set('Content-Security-Policy', buildCspWithNonce(btoa(crypto.randomUUID())));
  return response;
}

const isProtectedAppRoute = createRouteMatcher([
  '/chat(.*)',
  '/chats(.*)',
  '/settings(.*)',
  '/billing(.*)',
  '/admin(.*)',
]);

const isPublicApiRoute = createRouteMatcher([
  '/api/health',
  '/api/download(.*)',
  '/api/download-beta(.*)',
  '/api/models',
  '/api/waitlist(.*)',
]);

const isClerkSessionRoute = createRouteMatcher([
  '/__clerk/(.*)',
  '/chat(.*)',
  '/chats(.*)',
  '/settings(.*)',
  '/billing(.*)',
  '/admin(.*)',
  '/api/(.*)',
]);

const clerkAwareProxy = clerkMiddleware((_auth, request: NextRequest) => {
  return buildCspResponse(request);
});

export const proxy: NextMiddleware = (request, event) => {
  if (isProtectedAppRoute(request) && !hasBrowserSessionCookie(request)) {
    return buildSignedOutRedirect(request);
  }

  if (isPublicApiRoute(request)) {
    return buildCspResponse(request);
  }

  if (isClerkSessionRoute(request)) {
    return clerkAwareProxy(request, event);
  }

  return buildCspResponse(request);
};

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
