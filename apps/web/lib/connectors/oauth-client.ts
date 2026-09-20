import 'server-only';

import { z } from 'zod';

import { createDeadline, credentialedFetch } from '@/lib/url-fetch/guarded-fetch';
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

/** Names the host and the reason, never the secret that was being sent. */
function tokenTransportError(refusal: string, endpoint: URL): ConnectorOAuthTokenError {
  if (refusal === 'redirect_refused') {
    return new ConnectorOAuthTokenError(
      `Token endpoint ${endpoint.host} answered with a redirect; a credentialed exchange is ` +
        'never followed to another location',
      502,
      null,
    );
  }
  if (refusal === 'timeout' || refusal === 'cancelled') {
    return new ConnectorOAuthTokenError(
      `Token endpoint ${endpoint.host} did not answer`,
      504,
      null,
    );
  }
  return new ConnectorOAuthTokenError(
    `Token endpoint ${endpoint.host} could not be reached safely`,
    502,
    null,
  );
}

export interface OAuthTokenResult {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  accessTokenExpiresAt: Date | null;
  grantedScopes: string[];
}

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

/**
 * A token endpoint that answers with a redirect is not a token endpoint. The
 * request carries the client secret, and a 307 or 308 would replay it to
 * whatever host the redirect names, so the exchange fails instead.
 */
async function postToTokenEndpoint(
  provider: ConnectorOAuthProvider,
  tokenUrl: string,
  form: URLSearchParams,
  requestedScopes: string[],
): Promise<OAuthTokenResult> {
  let endpoint: URL;
  try {
    endpoint = new URL(tokenUrl);
  } catch {
    throw new ConnectorOAuthTokenError('Token endpoint is not a usable URL', 502, null);
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  applyClientAuthentication(provider, form, headers);

  const deadline = createDeadline(TOKEN_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    const outcome = await credentialedFetch(endpoint, {
      deadline,
      redirects: 'refuse',
      method: 'POST',
      headers,
      body: form,
    });
    if (!outcome.ok) throw tokenTransportError(outcome.refusal, endpoint);
    response = outcome.response;
  } finally {
    deadline.release();
  }

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

export async function revokeTokenAtProvider(
  provider: ConnectorOAuthProvider,
  token: string,
  tokenTypeHint: 'access_token' | 'refresh_token',
): Promise<boolean> {
  if (!provider.revocationUrl) return false;
  const deadline = createDeadline(TOKEN_REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    const form = new URLSearchParams({ token, token_type_hint: tokenTypeHint });
    applyClientAuthentication(provider, form, headers);
    const outcome = await credentialedFetch(new URL(provider.revocationUrl), {
      deadline,
      redirects: 'refuse',
      method: 'POST',
      headers,
      body: form,
    });
    if (!outcome.ok) return false;
    await outcome.response.body?.cancel().catch(() => undefined);
    return outcome.response.ok;
  } catch {
    return false;
  } finally {
    deadline.release();
  }
}
