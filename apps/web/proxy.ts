import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import type { NextMiddleware, NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Build a per-request Content-Security-Policy string with a nonce.
 *
 * The nonce replaces 'unsafe-inline' in script-src, preventing arbitrary inline
 * script injection (XSS). Next.js reads the nonce from the Content-Security-
 * Policy *request* header (set in buildCspResponse) and stamps it onto every
 * framework-injected bootstrap/hydration script.
 *
 * NOTE on the prod-wide 500 of 2026-06-14: this nonce + request-header rewriting
 * pattern was briefly suspected and swapped for 'unsafe-inline', but the actual
 * cause was `apps/web/package.json` `"type":"module"` breaking Vercel's CommonJS
 * function launcher (PR #392) — every Node render crashed regardless of CSP. The
 * nonce path was innocent; it is restored here.
 *
 * NOTE on style-src 'unsafe-inline': Tailwind, Radix, and ~28 components use
 * inline `style=` attributes, so style-src 'unsafe-inline' must stay regardless.
 */
function buildCspWithNonce(nonce: string, frameAncestors: "'none'" | "'self'" = "'none'"): string {
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
    frame-ancestors ${frameAncestors};
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
  // Generate a cryptographically-secure per-request nonce.
  const nonce = btoa(crypto.randomUUID());
  // Generated PDFs are served from an authenticated, owner-scoped route and
  // intentionally embedded by the same-origin artifact viewer. The route
  // rejects this preview mode for every non-PDF MIME, so source HTML and other
  // generated files keep the site-wide frame-ancestors 'none' boundary.
  const isPdfPreview =
    request.nextUrl.pathname.startsWith('/api/files/') &&
    request.nextUrl.searchParams.get('preview') === 'pdf';
  const csp = buildCspWithNonce(nonce, isPdfPreview ? "'self'" : "'none'");

  // Forward the nonce to Server Components via request headers (read in the root
  // layout via next/headers → headersList.get('x-nonce')). Setting the CSP on
  // the *request* header is how Next stamps the nonce onto its framework scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-agi-pathname', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
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
  '/library(.*)',
  '/schedules(.*)',
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
  '/library(.*)',
  '/schedules(.*)',
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
