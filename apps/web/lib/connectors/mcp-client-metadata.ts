/**
 * @file This deployment's OAuth client identity, as a Client ID Metadata Document.
 *
 * WHAT A CIMD IS AND WHY IT MATTERS HERE
 * --------------------------------------
 * Classic OAuth requires a human to register an application with each provider
 * and receive a `client_id` back. `lib/connectors/oauth-registry.ts` implements
 * exactly that, and it is the right model when the operator genuinely owns the
 * OAuth app. It is also why 83 of the entries in `lib/connectors/catalog.ts`
 * are not connectable: nobody has registered with those 83 vendors.
 *
 * Client ID Metadata Documents invert the direction. Instead of the client
 * holding an identifier the server issued, the client presents a URL — this
 * one — and the authorization server fetches it to learn who is asking. The
 * `client_id` IS the URL. No registration call happens in either direction.
 *
 * MCP's client-registration guidance orders the options: an existing
 * pre-registered client first (the operator really does own an app), then
 * CIMD, then dynamic client registration (RFC 7591, now deprecated for this
 * purpose), then finally prompting a human. `mcp-oauth-provider.ts` implements
 * that order — this module supplies the second rung.
 *
 * WHY THE DOCUMENT IS BUILT, NOT A STATIC FILE
 * --------------------------------------------
 * `redirect_uris` must be absolute, and the origin differs between local
 * development, preview deployments, and production. Deriving it from the same
 * server-side origin the broker uses for its redirect URI keeps the two from
 * drifting — a mismatch there is rejected by the authorization server at
 * redemption time with an error that says nothing useful.
 *
 * The origin comes from configuration and NEVER from the request's Host
 * header. A host-header-derived `redirect_uris` would let an attacker who can
 * spoof Host publish a document that authorizes their own callback.
 */

import 'server-only';

import {
  CONNECTOR_OAUTH_CALLBACK_PATH,
  MCP_CLIENT_METADATA_PATH,
} from '@agiworkforce/cloud-contracts';

/**
 * Human-facing identity shown on the vendor's consent screen. Users see this
 * when deciding whether to grant access, so it has to be the product name they
 * recognise rather than an internal service name.
 */
const CLIENT_NAME = 'AGI Workforce';

/**
 * Resolve the origin the client metadata document and its redirect URI live on.
 *
 * Returns null when no origin is configured, which is the honest state in a
 * local checkout with no env file: the caller then reports CIMD as unavailable
 * rather than publishing a document with a `http://localhost` redirect that no
 * authorization server will accept.
 */
export function resolveClientMetadataOrigin(): string | null {
  const configured = (
    process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] ??
    process.env['NEXT_PUBLIC_APP_URL'] ??
    ''
  ).trim();
  if (!configured) return null;

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return null;
  }

  // An authorization server fetches this document over the public internet and
  // will refuse a non-HTTPS `client_id`. A localhost origin cannot satisfy that
  // no matter how it is dressed up, so CIMD is simply unavailable there and the
  // provider falls through to dynamic registration.
  if (url.protocol !== 'https:') return null;

  return url.origin;
}

/**
 * The absolute `client_id` for this deployment, or null when CIMD is not
 * available here (see `resolveClientMetadataOrigin`).
 */
export function resolveClientMetadataUrl(): string | null {
  const origin = resolveClientMetadataOrigin();
  return origin ? `${origin}${MCP_CLIENT_METADATA_PATH}` : null;
}

/** The absolute redirect URI, matching the broker's hosted callback. */
export function resolveClientRedirectUri(): string | null {
  const origin = resolveClientMetadataOrigin();
  return origin ? `${origin}${CONNECTOR_OAUTH_CALLBACK_PATH}` : null;
}

/**
 * The client metadata document, in the shape RFC 7591 §2 defines for client
 * metadata and CIMD reuses verbatim.
 */
export interface McpClientMetadataDocument {
  client_id: string;
  client_name: string;
  client_uri: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
}

/**
 * Build the document. Returns null when this deployment cannot host a valid
 * one, so a caller never serves a half-formed identity.
 */
export function buildMcpClientMetadataDocument(): McpClientMetadataDocument | null {
  const origin = resolveClientMetadataOrigin();
  const clientId = resolveClientMetadataUrl();
  const redirectUri = resolveClientRedirectUri();
  if (!origin || !clientId || !redirectUri) return null;

  return {
    // Per CIMD the document must self-identify with the same URL it is served
    // from. An authorization server that fetches the URL and finds a different
    // `client_id` inside is required to reject it — that check is what stops
    // one client from publishing another's identity.
    client_id: clientId,
    client_name: CLIENT_NAME,
    client_uri: origin,
    redirect_uris: [redirectUri],
    // Authorization code only. This client never uses implicit or password
    // grants, and listing a grant type we do not use would widen what an
    // authorization server is willing to issue us.
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    // There is no client secret to authenticate with: the identity is the URL,
    // and PKCE is what binds the authorization request to the redemption.
    token_endpoint_auth_method: 'none',
  };
}
