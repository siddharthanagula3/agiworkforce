import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import type { NextMiddleware, NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Build the site Content-Security-Policy string.
 *
 * IMPORTANT (root cause of the prod-wide 500, 2026-06-14): we deliberately do
 * NOT use the nonce + `NextResponse.next({ request: { headers } })` request-
 * rewriting pattern from the Next.js CSP guide. That pattern 500'd every route
 * on Vercel's edge runtime — the failure happens in the edge layer *after* the
 * middleware returns (so it isn't even catchable in JS; a try/catch around the
 * body never fired and the response carried no error header). It worked under
 * local `next start` only because that runs middleware in the node runtime.
 * The redirect-only path (no request rewriting) was the sole survivor (307).
 *
 * So the policy is set on the RESPONSE only and uses 'unsafe-inline' for
 * script-src instead of a per-request nonce. This is the posture the site had
 * before the nonce work (commit cca7291) and is functional + edge-safe.
 * Re-introducing a strict nonce CSP requires an edge-safe way to feed the nonce
 * to the renderer without request-header rewriting — tracked as follow-up.
 *
 * NOTE on style-src 'unsafe-inline': Tailwind, Radix, and ~28 components use
 * inline `style=` attributes, so style-src 'unsafe-inline' must stay regardless.
 */
function buildCsp(): string {
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

function buildCspResponse(): NextResponse {
  // Response-only CSP, no request-header rewriting (see buildCsp for why).
  const response = NextResponse.next();
  response.headers.set('Content-Security-Policy', buildCsp());
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
  response.headers.set('Content-Security-Policy', buildCsp());
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

const clerkAwareProxy = clerkMiddleware(() => {
  return buildCspResponse();
});

export const proxy: NextMiddleware = (request, event) => {
  if (isProtectedAppRoute(request) && !hasBrowserSessionCookie(request)) {
    return buildSignedOutRedirect(request);
  }

  if (isPublicApiRoute(request)) {
    return buildCspResponse();
  }

  if (isClerkSessionRoute(request)) {
    return clerkAwareProxy(request, event);
  }

  return buildCspResponse();
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
