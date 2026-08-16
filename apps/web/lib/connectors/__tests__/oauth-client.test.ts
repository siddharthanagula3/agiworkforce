import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mockAssertResolvedPublicHostname = vi.fn();
vi.mock('@/lib/egress-policy', () => ({
  assertResolvedPublicHostname: (...a: unknown[]) => mockAssertResolvedPublicHostname(...a),
}));

import {
  ConnectorOAuthTokenError,
  exchangeAuthorizationCode,
  refreshAccessToken,
  revokeTokenAtProvider,
} from '../oauth-client';
import type { ConnectorOAuthProvider } from '../oauth-registry';

const PROVIDER: ConnectorOAuthProvider = {
  connectorId: 'linear',
  authorizationUrl: 'https://auth.example.com/authorize',
  tokenUrl: 'https://auth.example.com/token',
  mcpUrl: 'https://mcp.example.com/mcp',
  transport: 'streamable-http',
  scopes: ['read'],
  usePkce: true,
  tokenAuthMethod: 'client_secret_post',
  authorizationParams: {},
  enabled: true,
  clientId: 'client-id-value',
  clientSecret: 'client-secret-value',
};

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function submittedForm(callIndex = 0): URLSearchParams {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit;
  return init.body as URLSearchParams;
}

function submittedHeaders(callIndex = 0): Record<string, string> {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit;
  return init.headers as Record<string, string>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertResolvedPublicHostname.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('exchangeAuthorizationCode', () => {
  it('posts the authorization-code grant with PKCE and the client secret in the body', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        access_token: 'access-value',
        refresh_token: 'refresh-value',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'read write',
      }),
    );

    const result = await exchangeAuthorizationCode({
      provider: PROVIDER,
      code: 'auth-code',
      codeVerifier: 'verifier-value',
      redirectUri: 'https://app.example.com/api/connectors/oauth/callback',
      requestedScopes: ['read'],
    });

    expect(mockAssertResolvedPublicHostname).toHaveBeenCalledWith('https://auth.example.com/token');
    const form = submittedForm();
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe('auth-code');
    expect(form.get('code_verifier')).toBe('verifier-value');
    expect(form.get('redirect_uri')).toBe('https://app.example.com/api/connectors/oauth/callback');
    expect(form.get('client_id')).toBe('client-id-value');
    expect(form.get('client_secret')).toBe('client-secret-value');

    expect(result.accessToken).toBe('access-value');
    expect(result.refreshToken).toBe('refresh-value');
    expect(result.grantedScopes).toEqual(['read', 'write']);
    expect(result.accessTokenExpiresAt).toBeInstanceOf(Date);
  });

  it('uses HTTP Basic and keeps the secret out of the form for client_secret_basic', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'a' }));

    await exchangeAuthorizationCode({
      provider: { ...PROVIDER, tokenAuthMethod: 'client_secret_basic' },
      code: 'auth-code',
      codeVerifier: null,
      redirectUri: 'https://app.example.com/api/connectors/oauth/callback',
      requestedScopes: [],
    });

    expect(submittedForm().get('client_secret')).toBeNull();
    expect(submittedForm().get('code_verifier')).toBeNull();
    const authorization = submittedHeaders()['Authorization'] as string;
    expect(authorization.startsWith('Basic ')).toBe(true);
    expect(Buffer.from(authorization.slice(6), 'base64').toString('utf8')).toBe(
      'client-id-value:client-secret-value',
    );
  });

  it('sends no secret at all for a public client', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'a' }));

    await exchangeAuthorizationCode({
      provider: { ...PROVIDER, tokenAuthMethod: 'none', clientSecret: null },
      code: 'auth-code',
      codeVerifier: 'v',
      redirectUri: 'https://app.example.com/api/connectors/oauth/callback',
      requestedScopes: [],
    });

    expect(submittedForm().get('client_secret')).toBeNull();
    expect(submittedHeaders()['Authorization']).toBeUndefined();
  });

  it('falls back to the requested scopes when the provider omits `scope`', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'a' }));

    const result = await exchangeAuthorizationCode({
      provider: PROVIDER,
      code: 'c',
      codeVerifier: 'v',
      redirectUri: 'https://app.example.com/api/connectors/oauth/callback',
      requestedScopes: ['read'],
    });

    expect(result.grantedScopes).toEqual(['read']);
    expect(result.tokenType).toBe('Bearer');
    expect(result.accessTokenExpiresAt).toBeNull();
  });

  it('surfaces the OAuth error code and status, never the response body', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: 'invalid_grant', error_description: 'code auth-code already used' },
        400,
      ),
    );

    const error = await exchangeAuthorizationCode({
      provider: PROVIDER,
      code: 'auth-code',
      codeVerifier: 'v',
      redirectUri: 'https://app.example.com/api/connectors/oauth/callback',
      requestedScopes: [],
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConnectorOAuthTokenError);
    const tokenError = error as ConnectorOAuthTokenError;
    expect(tokenError.status).toBe(400);
    expect(tokenError.isInvalidGrant).toBe(true);
    expect(tokenError.message).not.toContain('auth-code');
  });

  it('rejects a token response missing an access token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token_type: 'Bearer' }));

    await expect(
      exchangeAuthorizationCode({
        provider: PROVIDER,
        code: 'c',
        codeVerifier: 'v',
        redirectUri: 'https://app.example.com/api/connectors/oauth/callback',
        requestedScopes: [],
      }),
    ).rejects.toThrow(/unexpected shape/i);
  });
});

describe('refreshAccessToken', () => {
  it('posts the refresh grant to the endpoint recorded on the grant', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'fresh' }));

    await refreshAccessToken({
      provider: PROVIDER,
      refreshToken: 'refresh-value',
      tokenEndpoint: 'https://auth.example.com/token',
      grantedScopes: ['read'],
    });

    expect(submittedForm().get('grant_type')).toBe('refresh_token');
    expect(submittedForm().get('refresh_token')).toBe('refresh-value');
  });

  it('refuses to refresh against a token endpoint the registry has since changed', async () => {
    const error = await refreshAccessToken({
      provider: PROVIDER,
      refreshToken: 'refresh-value',
      tokenEndpoint: 'https://old.example.com/token',
      grantedScopes: [],
    }).catch((e: unknown) => e as ConnectorOAuthTokenError);

    expect((error as ConnectorOAuthTokenError).isInvalidGrant).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('revokeTokenAtProvider', () => {
  it('is a no-op when the provider declares no revocation endpoint', async () => {
    await expect(revokeTokenAtProvider(PROVIDER, 'tok', 'refresh_token')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the token and hint, and reports failure instead of throwing', async () => {
    const provider = { ...PROVIDER, revocationUrl: 'https://auth.example.com/revoke' };
    fetchMock.mockResolvedValue(jsonResponse({}, 200));

    await expect(revokeTokenAtProvider(provider, 'tok', 'refresh_token')).resolves.toBe(true);
    expect(submittedForm().get('token')).toBe('tok');
    expect(submittedForm().get('token_type_hint')).toBe('refresh_token');

    fetchMock.mockRejectedValue(new Error('provider down'));
    await expect(revokeTokenAtProvider(provider, 'tok', 'access_token')).resolves.toBe(false);
  });
});
