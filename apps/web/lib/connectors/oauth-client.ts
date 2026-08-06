/**
 * @file Token-endpoint client for the connector OAuth broker.
 *
 * Mirrors `exchange_code_form` / `refresh_token` in
 * `crates/agiworkforce-mcp/src/oauth/flow.rs`: a form-encoded POST to the
 * authorization server, an `Accept: application/json` response, and a strict
 * shape check before anything is trusted.
 *
 * SECRET HANDLING. Nothing in this module logs a code, verifier, token, or
 * client secret. Errors carry the HTTP status and, at most, the provider's
 * machine-readable `error` code — never the response body, which routinely
 * echoes the submitted code back.
 */

import 'server-only';

import { z } from 'zod';

import { assertResolvedPublicHostname } from '@/lib/egress-policy';
import type { ConnectorOAuthProvider } from '@/lib/connectors/oauth-registry';

const TOKEN_REQUEST_TIMEOUT_MS = 10_000;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1).optional(),
  expires_in: z
    .number()
    .int()
    .positive()
    .max(60 * 60 * 24 * 365)
    .optional(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
});

const tokenErrorSchema = z.object({
  error: z.string().min(1).max(120),
});

export interface OAuthTokenResult {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  /** Absolute expiry, or null when the provider issued no `expires_in`. */
  accessTokenExpiresAt: Date | null;
  grantedScopes: string[];
}

/**
 * A token-endpoint failure the caller can act on.
 *
 * `invalid_grant` specifically means the authorization or refresh token is
 * dead: the broker revokes the stored grant so the user is asked to reconnect
 * instead of retrying a credential that can never work again (RFC 6749 §5.2).
 */
export class ConnectorOAuthTokenError extends Error {
  readonly status: number;
  readonly oauthError: string | null;

  constructor(message: string, status: number, oauthError: string | null) {
    super(message);
    this.name = 'ConnectorOAuthTokenError';
    this.status = status;
    this.oauthError = oauthError;
  }

  get isInvalidGrant(): boolean {
    return this.oauthError === 'invalid_grant';
  }
}

function applyClientAuthentication(
  provider: ConnectorOAuthProvider,
  form: URLSearchParams,
  headers: Record<string, string>,
): void {
  form.set('client_id', provider.clientId);
  if (provider.tokenAuthMethod === 'none' || !provider.clientSecret) return;
  if (provider.tokenAuthMethod === 'client_secret_basic') {
    const basic = Buffer.from(
      `${encodeURIComponent(provider.clientId)}:${encodeURIComponent(provider.clientSecret)}`,
    ).toString('base64');
    headers['Authorization'] = `Basic ${basic}`;
    return;
  }
  form.set('client_secret', provider.clientSecret);
}

async function postToTokenEndpoint(
  provider: ConnectorOAuthProvider,
  tokenUrl: string,
  form: URLSearchParams,
  requestedScopes: string[],
): Promise<OAuthTokenResult> {
  // The token endpoint comes from operator configuration, but it is still a
  // server-side outbound request with a secret attached: keep it under the same
  // DNS-resolution egress policy every other connector fetch runs under.
  await assertResolvedPublicHostname(tokenUrl);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  applyClientAuthentication(provider, form, headers);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers,
    body: form,
    signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
  });

  const rawBody: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsedError = tokenErrorSchema.safeParse(rawBody);
    throw new ConnectorOAuthTokenError(
      `Token endpoint returned ${response.status}`,
      response.status,
      parsedError.success ? parsedError.data.error : null,
    );
  }

  const parsed = tokenResponseSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new ConnectorOAuthTokenError('Token endpoint returned an unexpected shape', 502, null);
  }

  const data = parsed.data;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    tokenType: data.token_type ?? 'Bearer',
    accessTokenExpiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    // RFC 6749 §5.1: the response scope is authoritative when present and the
    // request scope is what was granted when it is omitted. Storing the guess
    // would let the UI claim a permission the user never gave.
    grantedScopes: data.scope ? data.scope.split(/\s+/).filter(Boolean) : requestedScopes,
  };
}

export async function exchangeAuthorizationCode(params: {
  provider: ConnectorOAuthProvider;
  code: string;
  codeVerifier: string | null;
  redirectUri: string;
  requestedScopes: string[];
}): Promise<OAuthTokenResult> {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
  });
  if (params.codeVerifier) form.set('code_verifier', params.codeVerifier);
  return postToTokenEndpoint(
    params.provider,
    params.provider.tokenUrl,
    form,
    params.requestedScopes,
  );
}

export async function refreshAccessToken(params: {
  provider: ConnectorOAuthProvider;
  refreshToken: string;
  /** Token endpoint recorded on the grant, so a registry edit cannot silently redirect it. */
  tokenEndpoint: string;
  grantedScopes: string[];
}): Promise<OAuthTokenResult> {
  if (params.tokenEndpoint !== params.provider.tokenUrl) {
    throw new ConnectorOAuthTokenError(
      'Stored grant was issued by a different token endpoint than the current registry entry',
      409,
      'invalid_grant',
    );
  }
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
  });
  return postToTokenEndpoint(params.provider, params.tokenEndpoint, form, params.grantedScopes);
}

/**
 * Best-effort provider-side revocation (RFC 7009). Returns false rather than
 * throwing: the local grant is dropped either way, and a provider outage must
 * never stop a user from disconnecting.
 */
export async function revokeTokenAtProvider(
  provider: ConnectorOAuthProvider,
  token: string,
  tokenTypeHint: 'access_token' | 'refresh_token',
): Promise<boolean> {
  if (!provider.revocationUrl) return false;
  try {
    await assertResolvedPublicHostname(provider.revocationUrl);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    const form = new URLSearchParams({ token, token_type_hint: tokenTypeHint });
    applyClientAuthentication(provider, form, headers);
    const response = await fetch(provider.revocationUrl, {
      method: 'POST',
      headers,
      body: form,
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}
