import {
  objectStorageUploadOrigins,
  resolveObjectStorageConfig,
} from '@agiworkforce/object-storage/config';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import type { NextMiddleware, NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCorsAndSecurityHeaders } from './lib/cors';
import { apiHostRewriteUsesClerk, isApiHostRewriteSource } from './lib/api-host-route-contract';
import { decideEuAccess, euBlockEnabled } from './lib/eu-access';
import { getClerkAuthorizedParties } from './lib/clerk-authorized-parties';
import { hasBrowserSessionCookie as isBrowserSessionCookiePresent } from './lib/session-cookie';

const CHAT_ROOT_PATH = '/chat';
const AGI_WORK_PATH = '/agi-work';
const AGI_CODE_PATH = '/agi-code';
const CLOUD_CODE_PATH = '/chat/code';

const UNAVAILABLE_PATH = '/region-unavailable';

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
  const sandboxOrigin = process.env['NEXT_PUBLIC_SANDBOX_ORIGIN']?.trim().replace(/\/+$/, '');
  const sandboxFrameSrc = sandboxOrigin ? ` ${sandboxOrigin}` : '';
  const storageUploadOrigins = objectStorageUploadOrigins(resolveObjectStorageConfig())
    .map((origin) => ` ${origin}`)
    .join('');
  const devUnsafeEval = process.env['NODE_ENV'] === 'production' ? '' : " 'unsafe-eval'";
  const clerkFapi = clerkFapiOrigin();
  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}'${devUnsafeEval}${clerkFapi} https://*.clerk.accounts.dev https://*.clerk.com https://js.stripe.com https://challenges.cloudflare.com https://www.googletagmanager.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://js.stripe.com;
    img-src 'self' data: blob: https:;
    font-src 'self' https://fonts.gstatic.com https://js.stripe.com data:;
    connect-src 'self'${storageUploadOrigins}${clerkFapi} https://*.clerk.accounts.dev https://*.clerk.com https://clerk-telemetry.com https://api.stripe.com https://vitals.vercel-insights.com https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com;
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
  const nonce = btoa(crypto.randomUUID());
  const isPdfPreview =
    request.nextUrl.pathname.startsWith('/api/files/') &&
    request.nextUrl.searchParams.get('preview') === 'pdf';
  const csp = buildCspWithNonce(nonce, isPdfPreview ? "'self'" : "'none'");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-agi-pathname', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

function hasBrowserSessionCookie(request: NextRequest): boolean {
  return isBrowserSessionCookiePresent(request.cookies.getAll());
}

// A signed-in visitor to a marketing route that has a real product surface
// behind it gets that surface instead of the pitch for it, the way ChatGPT's
// Work toggle and Claude's Cowork open the product rather than a landing page.
// A signed-out visitor keeps the marketing page. The rewrite (not a redirect)
// leaves the address bar showing the marketing path, matching how `/` already
// resolves to `/chat` for a signed-in session.
// The rewrite target's own query string is invisible to the rendered page:
// `useSearchParams()` reflects the browser's actual address bar (still
// showing the marketing path), not this internal URL. A page that needs to
// know it was reached via this rewrite reads the `x-agi-pathname` header
// this sets below, exactly as `apps/web/app/chat/layout.tsx` already does.
function buildProductRewriteResponse(request: NextRequest, targetPath: string): NextResponse {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCspWithNonce(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-agi-pathname', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = hasBrowserSessionCookie(request)
    ? NextResponse.rewrite(new URL(targetPath, request.url), {
        request: { headers: requestHeaders },
      })
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

function buildHomeResponse(request: NextRequest): NextResponse {
  return buildProductRewriteResponse(request, CHAT_ROOT_PATH);
}

function buildAgiWorkResponse(request: NextRequest): NextResponse {
  return buildProductRewriteResponse(request, CHAT_ROOT_PATH);
}

function buildAgiCodeResponse(request: NextRequest): NextResponse {
  return buildProductRewriteResponse(request, CLOUD_CODE_PATH);
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
  '/tasks(.*)',
  '/settings(.*)',
  '/billing(.*)',
  '/upgrade(.*)',
  '/admin(.*)',
  '/workspace(.*)',
  '/operator(.*)',
  '/welcome(.*)',
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
  '/login/complete',
  '/chat(.*)',
  '/library(.*)',
  '/schedules(.*)',
  '/tasks(.*)',
  '/settings(.*)',
  '/billing(.*)',
  '/upgrade(.*)',
  '/admin(.*)',
  '/workspace(.*)',
  '/operator(.*)',
  '/welcome(.*)',
  AGI_WORK_PATH,
  AGI_CODE_PATH,
  '/api/(.*)',
]);

const clerkAuthorizedParties = ((): string[] | null => {
  try {
    return getClerkAuthorizedParties();
  } catch {
    return null;
  }
})();

// Clerk skips the azp check entirely when authorizedParties is empty, so an
// unresolvable allowlist must stop the request instead of authenticating it.
const clerkAwareProxy = clerkAuthorizedParties
  ? clerkMiddleware(
      (_auth, request: NextRequest) => {
        if (request.nextUrl.pathname === '/') return buildHomeResponse(request);
        if (request.nextUrl.pathname === AGI_WORK_PATH) return buildAgiWorkResponse(request);
        if (request.nextUrl.pathname === AGI_CODE_PATH) return buildAgiCodeResponse(request);
        return buildCspResponse(request);
      },
      { authorizedParties: clerkAuthorizedParties },
    )
  : null;

function clerkUnconfiguredResponse(): NextResponse {
  const response = NextResponse.json(
    { error: 'Authentication is unavailable: no Clerk authorized-party allowlist is configured.' },
    { status: 503 },
  );
  response.headers.set('Content-Security-Policy', buildCspWithNonce(btoa(crypto.randomUUID())));
  return response;
}

function attachApiCors(request: NextRequest, response: Response): Response {
  return request.nextUrl.pathname.startsWith('/api/')
    ? withCorsAndSecurityHeaders(response, request)
    : response;
}

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
  if (isApiHostRewriteSource(request.nextUrl.pathname)) return null;
  const target = buildApiHostRedirectTarget(
    request.nextUrl.pathname,
    request.nextUrl.search,
    appHost,
  );
  if (!target) return null;
  return NextResponse.redirect(target, 307);
}

export function buildApiHostRedirectTarget(
  pathname: string,
  search: string,
  appHost: string,
): URL | null {
  const origin = `https://${appHost}`;
  try {
    const target = new URL(`${pathname.replace(/^\/+/, '/')}${search}`, origin);
    return target.origin === origin ? target : null;
  } catch {
    return null;
  }
}

function euAccessBlock(request: NextRequest): NextResponse | null {
  const decision = decideEuAccess(
    request.headers.get('x-vercel-ip-country'),
    euBlockEnabled(process.env),
  );
  if (!decision.blocked) return null;
  if (request.nextUrl.pathname === UNAVAILABLE_PATH) return null;
  const target = request.nextUrl.clone();
  target.pathname = UNAVAILABLE_PATH;
  target.search = '';
  const response = NextResponse.rewrite(target, { status: 451 });
  response.headers.set('x-agi-region-block', decision.country);
  return response;
}

export const proxy: NextMiddleware = async (request, event) => {
  const regionBlock = euAccessBlock(request);
  if (regionBlock) return regionBlock;

  const apiHostBounce = apiHostRedirect(request);
  if (apiHostBounce) return apiHostBounce;

  if (isProtectedAppRoute(request) && !hasBrowserSessionCookie(request)) {
    return buildSignedOutRedirect(request);
  }

  if (isPublicApiRoute(request)) {
    return attachApiCors(request, buildCspResponse(request));
  }

  if (
    request.nextUrl.pathname === '/' ||
    isClerkSessionRoute(request) ||
    apiHostRewriteUsesClerk(request.nextUrl.pathname)
  ) {
    if (!clerkAwareProxy) return attachApiCors(request, clerkUnconfiguredResponse());
    const response = await clerkAwareProxy(request, event);
    return response ? attachApiCors(request, response) : response;
  }

  return buildCspResponse(request);
};

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|\\.well-known/workflow/|api/stripe-webhook|api/media/video/openrouter-webhook|api/mobile/iap/apple-notifications|api/mobile/iap/google-notifications|api/llm/v1/audio|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    '/((?!api/stripe-webhook$|api/media/video/openrouter-webhook$|api/mobile/iap/apple-notifications$|api/mobile/iap/google-notifications$|api/llm/v1/audio)(?:api|trpc)(?:/.*)?)',
    '/__clerk/(.*)',
  ],
};
