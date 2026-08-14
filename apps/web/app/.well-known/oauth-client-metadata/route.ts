/**
 * @file Serves this deployment's OAuth Client ID Metadata Document.
 *
 * This endpoint IS our `client_id`. Authorization servers fetch it, server to
 * server, in the middle of a user's authorization request. Three properties are
 * load-bearing and easy to break by accident:
 *
 *   - **Unauthenticated.** The fetch carries no user session. Putting this path
 *     behind the app's auth middleware turns every connector's OAuth flow into
 *     an opaque failure at the authorization server.
 *   - **Public and stable.** The URL is our identity. Consent a user granted is
 *     recorded against it, so changing the path silently invalidates consents.
 *   - **Cacheable but not forever.** Authorization servers may cache the
 *     document; a short TTL lets a redirect-URI correction propagate without
 *     making every authorization wait on an origin fetch.
 *
 * When the deployment has no HTTPS origin configured — a local checkout, most
 * commonly — there is no valid document to serve. Returning 404 is the honest
 * answer: CIMD genuinely is not available here, and the OAuth provider falls
 * through to dynamic client registration instead.
 */

import { NextResponse } from 'next/server';

import { buildMcpClientMetadataDocument } from '@/lib/connectors/mcp-client-metadata';

/**
 * Read at request time rather than at build time: the origin comes from an
 * environment variable that differs between preview and production deployments
 * built from the same artifact.
 */
export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  const document = buildMcpClientMetadataDocument();

  if (!document) {
    return NextResponse.json(
      {
        error: 'not_available',
        error_description:
          'This deployment has no HTTPS origin configured, so it cannot publish a client metadata document.',
      },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(document, {
    status: 200,
    headers: {
      // RFC 7591 client metadata is plain JSON; no dedicated media type is
      // registered for the document, and authorization servers parse it as JSON.
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, must-revalidate',
      // The document is fetched server-side by authorization servers, but it is
      // also useful to be able to read it from a browser tool when debugging a
      // failed connect. Nothing in it is secret — it is a public identity.
      'Access-Control-Allow-Origin': '*',
    },
  });
}
