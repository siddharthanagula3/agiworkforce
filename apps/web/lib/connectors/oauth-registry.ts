import 'server-only';

import {
  CONNECTOR_OAUTH_CALLBACK_PATH,
  CONNECTOR_OAUTH_START_PATH,
} from '@agiworkforce/cloud-contracts';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { isSelfServiceConnector } from '@/lib/connectors/mcp-endpoints';
import { filterConnectorScopes } from '@/lib/connectors/oauth-scope-allowlist';

/**
 * Both broker addresses are cross-surface contract values (mobile and the
 * shared chat UI read the start path too), so they are declared once in
 * `@agiworkforce/cloud-contracts` and re-exported here for the server-side
 * callers that already import them from this module.
 */
export { CONNECTOR_OAUTH_CALLBACK_PATH, CONNECTOR_OAUTH_START_PATH };

export const CONNECTOR_OAUTH_PROVIDERS_ENV = 'CONNECTOR_OAUTH_PROVIDERS_JSON';
export const CONNECTOR_OAUTH_REDIRECT_BASE_ENV = 'CONNECTOR_OAUTH_REDIRECT_BASE_URL';
export const PUBLIC_APP_URL_ENV = 'NEXT_PUBLIC_APP_URL';
const CONNECTOR_OAUTH_ENV_PREFIX = 'CONNECTOR_OAUTH_';
const CLIENT_ID_ENV_SUFFIX = '_CLIENT_ID';
const CLIENT_SECRET_ENV_SUFFIX = '_CLIENT_SECRET';

const CONNECTOR_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

const RESERVED_CONNECTOR_IDS = new Set(['github']);
const RESERVED_CONNECTOR_PREFIXES = ['custom-', 'orgmcp-'];

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

export interface ConnectorOAuthProvider extends ProviderDescriptor {
  clientId: string;
  clientSecret: string | null;
}

let _registryCache: Map<string, ConnectorOAuthProvider> | null = null;
let _describedConnectorIds: Set<string> = new Set();

function credentialEnvPrefix(connectorId: string): string {
  return `${CONNECTOR_OAUTH_ENV_PREFIX}${connectorId.toUpperCase().replace(/-/g, '_')}`;
}

export interface ConnectorOAuthCredentialEnvNames {
  readonly clientId: string;
  readonly clientSecret: string;
}

export function connectorOAuthCredentialEnvNames(
  connectorId: string,
): ConnectorOAuthCredentialEnvNames {
  const prefix = credentialEnvPrefix(connectorId);
  return {
    clientId: `${prefix}${CLIENT_ID_ENV_SUFFIX}`,
    clientSecret: `${prefix}${CLIENT_SECRET_ENV_SUFFIX}`,
  };
}

function resolveCredentials(
  descriptor: ProviderDescriptor,
): { clientId: string; clientSecret: string | null } | null {
  const names = connectorOAuthCredentialEnvNames(descriptor.connectorId);
  const clientId = process.env[names.clientId]?.trim();
  const clientSecret = process.env[names.clientSecret]?.trim();
  if (!clientId) return null;
  if (descriptor.tokenAuthMethod === 'none') return { clientId, clientSecret: null };
  if (!clientSecret) return null;
  return { clientId, clientSecret };
}

function loadConnectorOAuthRegistry(): Map<string, ConnectorOAuthProvider> {
  if (_registryCache !== null) return _registryCache;

  const registry = new Map<string, ConnectorOAuthProvider>();
  const described = new Set<string>();
  const inline = process.env[CONNECTOR_OAUTH_PROVIDERS_ENV];

  try {
    const raw: unknown = inline ? JSON.parse(inline) : null;
    if (raw) {
      const parsed = providerFileSchema.parse(raw);
      let unconfigured = 0;
      for (const descriptor of parsed.providers) {
        if (!descriptor.enabled) continue;
        if (RESERVED_CONNECTOR_IDS.has(descriptor.connectorId)) continue;
        if (RESERVED_CONNECTOR_PREFIXES.some((p) => descriptor.connectorId.startsWith(p))) continue;
        described.add(descriptor.connectorId);
        const credentials = resolveCredentials(descriptor);
        if (!credentials) {
          unconfigured += 1;
          continue;
        }
        const { scopes, dropped } = filterConnectorScopes(
          descriptor.connectorId,
          descriptor.scopes,
        );
        if (dropped.length > 0) {
          logger.warn(
            { connectorId: descriptor.connectorId, dropped },
            '[connector-oauth] dropped operator-requested scopes above the documented ceiling',
          );
        }
        registry.set(descriptor.connectorId, { ...descriptor, scopes, ...credentials });
      }
      logger.info(
        { configured: registry.size, describedButUncredentialed: unconfigured },
        '[connector-oauth] loaded provider registry',
      );
    }
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : 'unparseable' },
      '[connector-oauth] failed to parse CONNECTOR_OAUTH_PROVIDERS_JSON, no OAuth connectors will be offered',
    );
  }

  _registryCache = registry;
  _describedConnectorIds = described;
  return registry;
}

export function __resetConnectorOAuthRegistryCacheForTests(): void {
  _registryCache = null;
  _describedConnectorIds = new Set();
}

export function getConnectorOAuthProvider(connectorId: string): ConnectorOAuthProvider | null {
  return loadConnectorOAuthRegistry().get(connectorId) ?? null;
}

export function hasConnectorOAuthDescriptor(connectorId: string): boolean {
  loadConnectorOAuthRegistry();
  return _describedConnectorIds.has(connectorId);
}

export function getOAuthConfiguredConnectorIds(): Set<string> {
  if (!getConnectorOAuthRedirectUri()) return new Set();
  return new Set(loadConnectorOAuthRegistry().keys());
}

export function isConnectorOAuthConfigured(connectorId: string): boolean {
  return getOAuthConfiguredConnectorIds().has(connectorId);
}

export function isConnectorOAuthSupported(connectorId: string): boolean {
  return getConnectorOAuthProvider(connectorId) !== null || isSelfServiceConnector(connectorId);
}

const LOCAL_DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

export function isLocalDevOrigin(origin: URL): boolean {
  return (
    process.env['NODE_ENV'] !== 'production' &&
    origin.protocol === 'http:' &&
    LOCAL_DEV_HOSTNAMES.has(origin.hostname)
  );
}

export function getConnectorOAuthRedirectUri(): string | null {
  const base = (
    process.env[CONNECTOR_OAUTH_REDIRECT_BASE_ENV] ??
    process.env[PUBLIC_APP_URL_ENV] ??
    ''
  ).trim();
  if (!base) return null;
  let origin: URL;
  try {
    origin = new URL(base);
  } catch {
    logger.error(
      '[connector-oauth] redirect base URL is not a valid URL, OAuth connectors stay unavailable',
    );
    return null;
  }
  if (origin.protocol !== 'https:' && !isLocalDevOrigin(origin)) {
    logger.error(
      '[connector-oauth] redirect base URL must use HTTPS, OAuth connectors stay unavailable',
    );
    return null;
  }
  return new URL(CONNECTOR_OAUTH_CALLBACK_PATH, origin.origin).toString();
}

export function isAllowedConnectorOAuthRedirectUri(redirectUri: string): boolean {
  const allowed = getConnectorOAuthRedirectUri();
  return allowed !== null && redirectUri === allowed;
}

const RETURN_PATH_RE = /^\/[^/\\]/;
// eslint-disable-next-line no-control-regex -- URL parsing strips tab/CR/LF anywhere in the input
const RETURN_PATH_CONTROL_RE = /[\u0000-\u001f\u007f]/;
const RETURN_PATH_PROBE_ORIGIN = 'https://connector-return-path.invalid';

export function sanitizeConnectorReturnPath(candidate: string | null | undefined): string {
  const fallback = '/connectors';
  if (!candidate || candidate.length > 512) return fallback;
  if (RETURN_PATH_CONTROL_RE.test(candidate)) return fallback;
  if (!RETURN_PATH_RE.test(candidate)) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(candidate, RETURN_PATH_PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (parsed.origin !== RETURN_PATH_PROBE_ORIGIN) return fallback;
  const resolved = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  return RETURN_PATH_RE.test(resolved) ? resolved : fallback;
}

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

export function buildConnectorOAuthStartPath(connectorId: string, returnPath?: string): string {
  const search = new URLSearchParams({ connectorId });
  if (returnPath) search.set('returnPath', sanitizeConnectorReturnPath(returnPath));
  return `${CONNECTOR_OAUTH_START_PATH}?${search.toString()}`;
}
