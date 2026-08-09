/**
 * @file Per-provider OAuth app registry for Managed Cloud connectors.
 *
 * Server-only. This is the "platform runs its own OAuth app" half of the
 * connector story: the operator registers an OAuth application with each
 * provider, and this module turns those platform-held credentials into a
 * connector that a signed-in user can actually click Connect on.
 *
 * SHIPS WITH ZERO PROVIDERS ON PURPOSE. Authorize/token endpoints, scope
 * strings, and client credentials are provider facts that change and that this
 * repository cannot prove, so none are hardcoded. A provider becomes
 * OAuth-connectable ONLY when an operator supplies it; until then
 * `/api/connectors` keeps reporting it exactly as unavailable as it does today.
 * There is deliberately no "well-known provider" fallback table — a wrong
 * endpoint baked into the product would send a user's authorization code to the
 * wrong host.
 *
 * OPERATOR CONFIGURATION
 * ----------------------
 * `CONNECTOR_OAUTH_PROVIDERS_JSON` — non-secret provider descriptors:
 *
 *   {"providers":[{
 *     "connectorId":"linear",
 *     "displayName":"Linear",
 *     "authorizationUrl":"https://…",   // provider's authorize endpoint
 *     "tokenUrl":"https://…",           // provider's token endpoint
 *     "revocationUrl":"https://…",      // optional, RFC 7009
 *     "mcpUrl":"https://…",             // the connector's MCP endpoint
 *     "transport":"streamable-http",    // or "sse"
 *     "scopes":["…"],
 *     "usePkce":true,                   // default true (RFC 7636, S256)
 *     "tokenAuthMethod":"client_secret_post",
 *     "authorizationParams":{"prompt":"consent"}
 *   }]}
 *
 * `CONNECTOR_OAUTH_<CONNECTOR_ID>_CLIENT_ID` and
 * `CONNECTOR_OAUTH_<CONNECTOR_ID>_CLIENT_SECRET` — the SECRETS, kept out of the
 * JSON blob so the descriptor can be reviewed, diffed, and logged safely.
 * `<CONNECTOR_ID>` is the connectorId upper-cased with `-` replaced by `_`
 * (`google-calendar` → `CONNECTOR_OAUTH_GOOGLE_CALENDAR_CLIENT_ID`). A public
 * client (`tokenAuthMethod: "none"`) needs only the client id.
 *
 * `CONNECTOR_OAUTH_REDIRECT_BASE_URL` — origin the hosted callback lives on,
 * falling back to `NEXT_PUBLIC_APP_URL`. The redirect URI is derived from this
 * server-side value and NEVER from the request's Host header, so a host-header
 * injection cannot redirect an authorization code to an attacker origin.
 *
 * Validation follows `loadConnectorMcpMap` (lib/user-connector-tools.ts) and
 * `lib/github-app.ts`: parse once, cache for the process lifetime, log and
 * ignore a malformed value, and treat a partially-configured provider as
 * absent rather than as broken-but-advertised.
 */

import 'server-only';

import {
  CONNECTOR_OAUTH_CALLBACK_PATH,
  CONNECTOR_OAUTH_START_PATH,
} from '@agiworkforce/cloud-contracts';
import { z } from 'zod';

import { logger } from '@/lib/logger';

/**
 * Both broker addresses are cross-surface contract values (mobile and the
 * shared chat UI read the start path too), so they are declared once in
 * `@agiworkforce/cloud-contracts` and re-exported here for the server-side
 * callers that already import them from this module.
 */
export { CONNECTOR_OAUTH_CALLBACK_PATH, CONNECTOR_OAUTH_START_PATH };

/**
 * connectorId shape. Lower-case, no underscore: the id becomes the MCP
 * serverId, and `parseQualifiedToolName` (lib/mcp-tool-executor.ts) splits
 * `mcp__<serverId>__<tool>` on underscores.
 */
const CONNECTOR_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** serverId namespaces owned by other connector sources; an operator cannot claim them. */
const RESERVED_CONNECTOR_IDS = new Set(['github']);
const RESERVED_CONNECTOR_PREFIXES = ['custom-', 'orgmcp-'];

/**
 * Authorization-request parameters the broker owns. An operator may add
 * provider-specific extras (`prompt`, `access_type`, `audience`, …) but must
 * not be able to overwrite the ones that carry the security properties.
 */
const PROTECTED_AUTHORIZATION_PARAMS = new Set([
  'client_id',
  'client_secret',
  'redirect_uri',
  'response_type',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
]);

const httpsUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === 'https:', 'must use HTTPS');

const providerDescriptorSchema = z.object({
  connectorId: z.string().regex(CONNECTOR_ID_RE, 'connectorId must be lower-case and hyphenated'),
  displayName: z.string().min(1).max(120).optional(),
  authorizationUrl: httpsUrl,
  tokenUrl: httpsUrl,
  revocationUrl: httpsUrl.optional(),
  mcpUrl: httpsUrl,
  transport: z.enum(['streamable-http', 'sse']).optional().default('streamable-http'),
  scopes: z.array(z.string().min(1).max(256)).max(64).optional().default([]),
  usePkce: z.boolean().optional().default(true),
  tokenAuthMethod: z
    .enum(['client_secret_post', 'client_secret_basic', 'none'])
    .optional()
    .default('client_secret_post'),
  authorizationParams: z
    .record(z.string(), z.string())
    .optional()
    .default({})
    .refine(
      (params) => Object.keys(params).every((key) => !PROTECTED_AUTHORIZATION_PARAMS.has(key)),
      'authorizationParams may not override a broker-owned OAuth parameter',
    ),
  enabled: z.boolean().optional().default(true),
});

const providerFileSchema = z.object({
  providers: z.array(providerDescriptorSchema),
});

type ProviderDescriptor = z.infer<typeof providerDescriptorSchema>;

/** A provider that is fully configured — descriptor AND platform credentials. */
export interface ConnectorOAuthProvider extends ProviderDescriptor {
  clientId: string;
  /** Absent only for a public client (`tokenAuthMethod: 'none'`). */
  clientSecret: string | null;
}

let _registryCache: Map<string, ConnectorOAuthProvider> | null = null;

function credentialEnvPrefix(connectorId: string): string {
  return `CONNECTOR_OAUTH_${connectorId.toUpperCase().replace(/-/g, '_')}`;
}

/**
 * Resolve the platform credentials for one descriptor, or null when the
 * operator has not supplied them.
 *
 * A descriptor without credentials is NOT an error and is NOT logged as one:
 * it is the normal state of a provider an operator has described but not yet
 * registered an OAuth app for. It simply stays unavailable.
 */
function resolveCredentials(
  descriptor: ProviderDescriptor,
): { clientId: string; clientSecret: string | null } | null {
  const prefix = credentialEnvPrefix(descriptor.connectorId);
  const clientId = process.env[`${prefix}_CLIENT_ID`]?.trim();
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`]?.trim();
  if (!clientId) return null;
  if (descriptor.tokenAuthMethod === 'none') return { clientId, clientSecret: null };
  if (!clientSecret) return null;
  return { clientId, clientSecret };
}

function loadConnectorOAuthRegistry(): Map<string, ConnectorOAuthProvider> {
  if (_registryCache !== null) return _registryCache;

  const registry = new Map<string, ConnectorOAuthProvider>();
  const inline = process.env['CONNECTOR_OAUTH_PROVIDERS_JSON'];

  try {
    const raw: unknown = inline ? JSON.parse(inline) : null;
    if (raw) {
      const parsed = providerFileSchema.parse(raw);
      let unconfigured = 0;
      for (const descriptor of parsed.providers) {
        if (!descriptor.enabled) continue;
        if (RESERVED_CONNECTOR_IDS.has(descriptor.connectorId)) continue;
        if (RESERVED_CONNECTOR_PREFIXES.some((p) => descriptor.connectorId.startsWith(p))) continue;
        const credentials = resolveCredentials(descriptor);
        if (!credentials) {
          unconfigured += 1;
          continue;
        }
        registry.set(descriptor.connectorId, { ...descriptor, ...credentials });
      }
      logger.info(
        { configured: registry.size, describedButUncredentialed: unconfigured },
        '[connector-oauth] loaded provider registry',
      );
    }
  } catch (err) {
    // Same posture as loadConnectorMcpMap: a malformed value yields NO
    // providers rather than a partially-trusted set. Never log the raw value —
    // an operator may have inlined something sensitive by mistake.
    logger.error(
      { error: err instanceof Error ? err.message : 'unparseable' },
      '[connector-oauth] failed to parse CONNECTOR_OAUTH_PROVIDERS_JSON — no OAuth connectors will be offered',
    );
  }

  _registryCache = registry;
  return registry;
}

/** TEST-ONLY: reset the cached registry so env changes take effect. */
export function __resetConnectorOAuthRegistryCacheForTests(): void {
  _registryCache = null;
}

/** The fully-configured provider for `connectorId`, or null. */
export function getConnectorOAuthProvider(connectorId: string): ConnectorOAuthProvider | null {
  return loadConnectorOAuthRegistry().get(connectorId) ?? null;
}

/**
 * Connector ids that can honestly show a Connect button right now: the operator
 * described the provider AND supplied its client credentials AND this
 * deployment has a usable hosted callback origin. Missing any of the three and
 * the id is absent, which is what keeps the directory from lying.
 */
export function getOAuthConfiguredConnectorIds(): Set<string> {
  if (!getConnectorOAuthRedirectUri()) return new Set();
  return new Set(loadConnectorOAuthRegistry().keys());
}

export function isConnectorOAuthConfigured(connectorId: string): boolean {
  return getOAuthConfiguredConnectorIds().has(connectorId);
}

/**
 * The one redirect URI this deployment will ever send to an authorization
 * server, and the only one the callback will replay at the token endpoint.
 *
 * Derived from server-side configuration exclusively. Returns null when the
 * origin is missing or is not usable (non-HTTPS outside development), which
 * makes every provider report unavailable rather than starting a flow that
 * would strand the user on a mismatched redirect.
 */
export function getConnectorOAuthRedirectUri(): string | null {
  const base = (
    process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] ??
    process.env['NEXT_PUBLIC_APP_URL'] ??
    ''
  ).trim();
  if (!base) return null;
  let origin: URL;
  try {
    origin = new URL(base);
  } catch {
    logger.error(
      '[connector-oauth] redirect base URL is not a valid URL — OAuth connectors stay unavailable',
    );
    return null;
  }
  const isLocalHttp =
    process.env['NODE_ENV'] !== 'production' &&
    origin.protocol === 'http:' &&
    (origin.hostname === 'localhost' || origin.hostname === '127.0.0.1');
  if (origin.protocol !== 'https:' && !isLocalHttp) {
    logger.error(
      '[connector-oauth] redirect base URL must use HTTPS — OAuth connectors stay unavailable',
    );
    return null;
  }
  return new URL(CONNECTOR_OAUTH_CALLBACK_PATH, origin.origin).toString();
}

/**
 * Assert that `redirectUri` is the one this deployment issues.
 *
 * Called on the callback leg before the code is exchanged: the stored pending
 * row carries the URI that was actually sent, and it must still match current
 * configuration. A registry edited mid-flow therefore fails the exchange
 * instead of silently exchanging against a different registered client.
 */
export function isAllowedConnectorOAuthRedirectUri(redirectUri: string): boolean {
  const allowed = getConnectorOAuthRedirectUri();
  return allowed !== null && redirectUri === allowed;
}

/**
 * Same-origin relative path guard for the post-callback return.
 *
 * The accepted shape is deliberately identical to the
 * `connector_oauth_authorizations.return_path` CHECK in migration 0097
 * (`^/[^/\\]`), so a value that passes here can never fail the insert: a
 * rejected path must degrade to the connectors surface, not to a 500 in the
 * middle of an authorization the user just consented to.
 */
export function sanitizeConnectorReturnPath(candidate: string | null | undefined): string {
  const fallback = '/connectors';
  if (!candidate || candidate.length > 512) return fallback;
  // Reject anything that could leave the origin: absolute URLs, scheme-relative
  // `//host`, and the backslash variants browsers normalise to a slash.
  return /^\/[^/\\]/.test(candidate) ? candidate : fallback;
}

/**
 * Build the provider's authorization URL for one pending flow.
 *
 * `state` and `codeChallenge` are produced by the caller (lib/connectors/pkce.ts
 * + the pending-authorization store) so this function stays pure and testable.
 */
export function buildAuthorizationUrl(params: {
  provider: ConnectorOAuthProvider;
  redirectUri: string;
  state: string;
  codeChallenge: string | null;
}): string {
  const { provider, redirectUri, state, codeChallenge } = params;
  if (!isAllowedConnectorOAuthRedirectUri(redirectUri)) {
    throw new Error('Refusing to build an authorization URL for a non-allowlisted redirect URI');
  }
  const url = new URL(provider.authorizationUrl);
  // Operator extras first so the broker-owned parameters below always win, even
  // if the protected-key refinement is ever relaxed.
  for (const [key, value] of Object.entries(provider.authorizationParams)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', provider.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  if (provider.scopes.length > 0) url.searchParams.set('scope', provider.scopes.join(' '));
  if (codeChallenge) {
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return url.toString();
}

/** The path a client navigates to in order to connect `connectorId`. */
export function buildConnectorOAuthStartPath(connectorId: string, returnPath?: string): string {
  const search = new URLSearchParams({ connectorId });
  if (returnPath) search.set('returnPath', sanitizeConnectorReturnPath(returnPath));
  return `${CONNECTOR_OAUTH_START_PATH}?${search.toString()}`;
}
