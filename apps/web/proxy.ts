import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import type { NextMiddleware, NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCorsAndSecurityHeaders } from './lib/cors';
import { apiHostRewriteUsesClerk, isApiHostRewriteSource } from './lib/api-host-route-contract';

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
  const r2AccountId = process.env['CLOUDFLARE_R2_ACCOUNT_ID']?.trim();
  const r2BucketName = process.env['CLOUDFLARE_R2_BUCKET_NAME']?.trim();
  const r2PrivateBucketName = process.env['CLOUDFLARE_R2_PRIVATE_BUCKET_NAME']?.trim();
  const r2BucketOrigin = (bucketName: string | undefined): string =>
    r2AccountId &&
    /^[a-f0-9]{32}$/iu.test(r2AccountId) &&
    bucketName &&
    /^(?!-)[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/u.test(bucketName)
      ? ` https://${bucketName}.${r2AccountId}.r2.cloudflarestorage.com`
      : '';
  const r2UploadOrigins = `${r2BucketOrigin(r2BucketName)}${r2BucketOrigin(r2PrivateBucketName)}`;
  const devUnsafeEval = process.env['NODE_ENV'] === 'production' ? '' : " 'unsafe-eval'";
  const clerkFapi = clerkFapiOrigin();
  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}'${devUnsafeEval}${clerkFapi} https://*.clerk.accounts.dev https://*.clerk.com https://js.stripe.com https://challenges.cloudflare.com https://www.googletagmanager.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://js.stripe.com;
    img-src 'self' data: blob: https:;
    font-src 'self' https://fonts.gstatic.com https://js.stripe.com data:;
    connect-src 'self'${r2UploadOrigins}${clerkFapi} https://*.clerk.accounts.dev https://*.clerk.com https://clerk-telemetry.com https://api.stripe.com https://vitals.vercel-insights.com https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com;
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
  '/login/complete',
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
  const target = new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    `https://${appHost}`,
  );
  return NextResponse.redirect(target, 307);
}

export const proxy: NextMiddleware = async (request, event) => {
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
