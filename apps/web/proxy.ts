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
/**
 * The Clerk Frontend API origin this deployment loads ClerkJS from, as a
 * leading-space CSP token, or `''` when it cannot be derived.
 *
 * A **development** Clerk instance serves ClerkJS from `*.clerk.accounts.dev`,
 * which the static allowlist already covers. A **production** instance serves
 * it from the CNAME'd subdomain of your own domain — `clerk.agiworkforce.com`
 * — which matches neither `*.clerk.accounts.dev` nor `*.clerk.com`. So the
 * swap from `pk_test_` to `pk_live_` silently broke every auth screen: CSP
 * blocked `clerk.browser.js`, `<SignIn />` never mounted, and `/login`
 * rendered its marketing column beside an empty space with no error visible to
 * the user. Nothing about the Clerk instance was wrong — DNS resolved and its
 * API answered 200 the whole time.
 *
 * The host is derived from the publishable key rather than hardcoded, because
 * the key already encodes it (`pk_<env>_<base64("<fapi-host>$")>`). Hardcoding
 * `clerk.agiworkforce.com` would work today and rot on the next domain change,
 * and would leave preview deployments on a different instance broken.
 *
 * Shape-validated as a hostname before use, matching the R2 origin below: an
 * env typo must not be able to widen `script-src` to an arbitrary host.
 */
function clerkFapiOrigin(): string {
  const key = process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY']?.trim();
  const encoded = key?.replace(/^pk_(test|live)_/u, '');
  if (!encoded || encoded === key) return '';
  let host: string;
  try {
    host = atob(encoded).replace(/\$+$/u, '');
  } catch {
    return '';
  }
  if (!/^(?!-)[a-z0-9-]{1,63}(?:\.(?!-)[a-z0-9-]{1,63})+$/u.test(host)) return '';
  return ` https://${host}`;
}

function buildCspWithNonce(nonce: string, frameAncestors: "'none'" | "'self'" = "'none'"): string {
  // WEB-13 / WEB-20 (audit 2026-05-19): allow framing the artifact sandbox
  // origin so the cross-origin renderer at sandbox.agiworkforce.com can be
  // embedded by the chat UI. When NEXT_PUBLIC_SANDBOX_ORIGIN is unset the
  // parent falls back to a same-origin srcDoc iframe — no frame-src change
  // needed in that case ('self' already covers it).
  const sandboxOrigin = process.env['NEXT_PUBLIC_SANDBOX_ORIGIN']?.trim().replace(/\/+$/, '');
  const sandboxFrameSrc = sandboxOrigin ? ` ${sandboxOrigin}` : '';
  // Direct browser uploads use short-lived presigned PUT URLs on the account's
  // R2 S3-compatible endpoint. Keep this exact-origin: validating Cloudflare's
  // 32-hex account-id shape prevents an env typo from widening connect-src to
  // an attacker-controlled host.
  const r2AccountId = process.env['CLOUDFLARE_R2_ACCOUNT_ID']?.trim();
  const r2BucketName = process.env['CLOUDFLARE_R2_BUCKET_NAME']?.trim();
  const r2UploadOrigin =
    r2AccountId &&
    /^[a-f0-9]{32}$/iu.test(r2AccountId) &&
    r2BucketName &&
    /^(?!-)[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/u.test(r2BucketName)
      ? ` https://${r2BucketName}.${r2AccountId}.r2.cloudflarestorage.com`
      : '';
  const devUnsafeEval = process.env['NODE_ENV'] === 'production' ? '' : " 'unsafe-eval'";
  const clerkFapi = clerkFapiOrigin();
  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}'${devUnsafeEval}${clerkFapi} https://*.clerk.accounts.dev https://*.clerk.com https://js.stripe.com https://challenges.cloudflare.com https://www.googletagmanager.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://js.stripe.com;
    img-src 'self' data: blob: https:;
    font-src 'self' https://fonts.gstatic.com https://js.stripe.com data:;
    connect-src 'self'${r2UploadOrigin}${clerkFapi} https://*.clerk.accounts.dev https://*.clerk.com https://clerk-telemetry.com https://api.stripe.com https://vitals.vercel-insights.com https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com;
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

/**
 * Send browsers that land on the API host back to the app host.
 *
 * `api.agiworkforce.com` exists only to expose the OpenAI-compatible endpoints
 * via the host rewrites in `vercel.json` (`/v1/chat/completions`, `/v1/models`,
 * `/health`, …). Everything else on that host fell through to the same Next
 * app, so it happily served the marketing site and the signed-in chat UI on a
 * hostname that was never meant to render either.
 *
 * That is how "Authentication required" appears while the sidebar still shows
 * your account: the page renders, but it is not the origin the session belongs
 * to, so every authed request fails. The UI looks signed in and the API
 * disagrees — the confusing half-state rather than a clean redirect to login.
 *
 * Only the exact `api.` + app-host pair is matched. Preview deployments
 * (`agiworkforce-<hash>.vercel.app`) and localhost must keep serving the app
 * normally, so a looser check — "not the app host" — would take the whole
 * preview environment down.
 *
 * Paths already rewritten to `/api/*` are left alone: that is the API traffic
 * this host is for, and by the time middleware runs the rewrite has happened.
 */
function apiHostRedirect(request: NextRequest): NextResponse | null {
  const host = request.headers.get('host');
  if (!host) return null;
  let appHost: string;
  try {
    appHost = new URL(process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com').host;
  } catch {
    return null;
  }
  if (host !== `api.${appHost}`) return null;
  if (request.nextUrl.pathname.startsWith('/api/')) return null;
  const target = new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    `https://${appHost}`,
  );
  // 307, not 308: a POST to a mistyped API path must not be silently cached as
  // permanently living on the app host.
  return NextResponse.redirect(target, 307);
}

export const proxy: NextMiddleware = (request, event) => {
  const apiHostBounce = apiHostRedirect(request);
  if (apiHostBounce) return apiHostBounce;

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
     * - .well-known/workflow/* — Workflow SDK flow/step callbacks carry
     *   internal binary payloads and must bypass Clerk/CSP request rewriting.
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
    '/((?!_next/static|_next/image|favicon.ico|\\.well-known/workflow/|api/stripe-webhook|api/llm/v1/audio|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
};
