import 'server-only';

import type { NextRequest } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { authenticateScimRequest, scimBaseUrl, type ScimRequestContext } from './scim-auth';
import { ScimError, scimError, SCIM_CONTENT_TYPE } from './scim-protocol';

export async function withScim(
  request: NextRequest,
  handler: (context: ScimRequestContext, baseUrl: string) => Promise<Response>,
): Promise<Response> {
  const rateLimited = await withRateLimit(request, 'scim');
  if (rateLimited) {
    return scimError(429, 'Too many SCIM requests. Retry after the rate limit window.', 'tooMany');
  }

  try {
    const context = await authenticateScimRequest(request);
    return await handler(context, scimBaseUrl(request));
  } catch (error) {
    if (error instanceof ScimError) {
      return error.toResponse();
    }
    logger.error({ error, path: new URL(request.url).pathname }, 'Unhandled SCIM error');
    return scimError(500, 'Internal error');
  }
}

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
