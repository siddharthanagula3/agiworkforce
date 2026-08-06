import 'server-only';

import type { NextRequest } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { authenticateScimRequest, scimBaseUrl, type ScimRequestContext } from './scim-auth';
import { ScimError, scimError, SCIM_CONTENT_TYPE } from './scim-protocol';

/**
 * The single entry point every SCIM route uses.
 *
 * It guarantees, in order:
 *   1. rate limiting (the routes are reachable unauthenticated and each
 *      authenticated attempt costs an Argon2id verification);
 *   2. bearer authentication resolved from the token alone — no cookie
 *      session, no CSRF token, no Clerk fallback;
 *   3. a live `enterprise_controls` entitlement check that fails closed;
 *   4. spec-shaped `application/scim+json` errors for every failure, including
 *      unexpected ones, so an IdP never receives an HTML error page.
 *
 * Argon2 is a native module, so every route that mounts this must also export
 * `runtime = 'nodejs'`.
 */
export async function withScim(
  request: NextRequest,
  handler: (context: ScimRequestContext, baseUrl: string) => Promise<Response>,
): Promise<Response> {
  const rateLimited = await withRateLimit(request, 'scim');
  if (rateLimited) {
    // Re-shape the shared 429 into a SCIM error so the IdP can parse it.
    return scimError(429, 'Too many SCIM requests. Retry after the rate limit window.', 'tooMany');
  }

  try {
    const context = await authenticateScimRequest(request);
    return await handler(context, scimBaseUrl(request));
  } catch (error) {
    if (error instanceof ScimError) {
      return error.toResponse();
    }
    // Never leak a driver message or stack to the IdP.
    logger.error({ error, path: new URL(request.url).pathname }, 'Unhandled SCIM error');
    return scimError(500, 'Internal error');
  }
}

/**
 * Discovery documents (`/ServiceProviderConfig`, `/ResourceTypes`, `/Schemas`)
 * are still credential-gated: RFC 7644 §2 permits them to be anonymous, but
 * they would otherwise be an unauthenticated fingerprint of this deployment,
 * and every real IdP sends the token it was configured with.
 */
export async function withScimDiscovery(
  request: NextRequest,
  build: (baseUrl: string) => unknown,
): Promise<Response> {
  return withScim(request, async (_context, baseUrl) => {
    return new Response(JSON.stringify(build(baseUrl)), {
      status: 200,
      headers: { 'content-type': SCIM_CONTENT_TYPE, 'cache-control': 'no-store' },
    });
  });
}

const MAX_SCIM_BODY_BYTES = 256 * 1024;

/**
 * Read a SCIM request body with an explicit size cap.
 *
 * `readJsonBody` has no cap, and these routes accept unauthenticated
 * connections up to the point the token is verified, so an oversized body must
 * be refused rather than buffered.
 */
export async function readScimBody(request: Request): Promise<Record<string, unknown>> {
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > MAX_SCIM_BODY_BYTES) {
      throw new ScimError(413, 'Request body is too large', 'tooMany');
    }
  }

  const text = await request.text();
  if (text.length > MAX_SCIM_BODY_BYTES) {
    throw new ScimError(413, 'Request body is too large', 'tooMany');
  }
  if (text.trim() === '') {
    throw new ScimError(400, 'A JSON body is required', 'invalidSyntax');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ScimError(400, 'Request body is not valid JSON', 'invalidSyntax');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ScimError(400, 'Request body must be a JSON object', 'invalidSyntax');
  }

  return parsed as Record<string, unknown>;
}
