// @vitest-environment node

import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getClient: vi.fn(),
  saveClient: vi.fn(),
  deleteClient: vi.fn(),
  savePending: vi.fn(),
  saveGrant: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/connectors/mcp-oauth-clients', () => ({
  getMcpOAuthClient: mocks.getClient,
  saveMcpOAuthClient: mocks.saveClient,
  deleteMcpOAuthClient: mocks.deleteClient,
}));
vi.mock('@/lib/connectors/oauth-store', () => ({
  createPendingAuthorization: mocks.savePending,
  upsertConnectorOAuthGrant: mocks.saveGrant,
}));
vi.mock('@/lib/egress-policy', async (importOriginal) => ({
  ...(await importOriginal()),
  assertResolvedPublicHostname: vi.fn(async () => undefined),
  pinnedPublicFetch: (input: unknown, init?: unknown) =>
    (globalThis.fetch as unknown as (i: unknown, n?: unknown) => Promise<Response>)(input, init),
}));

import {
  beginMcpAuthorization,
  completeMcpAuthorization,
  refreshDiscoveredGrant,
  revokeDiscoveredGrant,
} from '../mcp-discovery';
import { resolveClientMetadataUrl, resolveClientRedirectUri } from '../mcp-client-metadata';
import type { PendingAuthorization } from '../oauth-store';
import type { McpOAuthClientRecord } from '../mcp-oauth-clients';

const MCP_URL = 'https://mcp.example.test/mcp';
const ORIGINAL_ISSUER = 'https://auth.example.test';
let currentIssuer: string;
let registrationMethod: 'cimd' | 'dynamic';
let resourceScopes: string[] | null;
let tokenRequests: { url: string; body: URLSearchParams }[];

beforeEach(() => {
  currentIssuer = ORIGINAL_ISSUER;
  registrationMethod = 'cimd';
  resourceScopes = null;
  tokenRequests = [];
  vi.stubEnv('CONNECTOR_OAUTH_REDIRECT_BASE_URL', 'https://app.example.test');
  const clients = new Map<string, McpOAuthClientRecord>();
  mocks.getClient.mockImplementation(async (issuer: string) => clients.get(issuer) ?? null);
  mocks.saveClient.mockImplementation(async (record: McpOAuthClientRecord) => {
    clients.set(record.issuer, record);
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://mcp.example.test/.well-known/oauth-protected-resource/mcp') {
        return Response.json({
          resource: MCP_URL,
          authorization_servers: [currentIssuer],
          ...(resourceScopes ? { scopes_supported: resourceScopes } : {}),
        });
      }
      if (url === `${currentIssuer}/.well-known/oauth-authorization-server`) {
        return Response.json({
          issuer: currentIssuer,
          authorization_endpoint: `${currentIssuer}/authorize`,
          token_endpoint: `${currentIssuer}/token`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
          client_id_metadata_document_supported: registrationMethod === 'cimd',
          ...(registrationMethod === 'dynamic'
            ? { registration_endpoint: `${currentIssuer}/register` }
            : {}),
        });
      }
      if (url === `${currentIssuer}/register`) {
        return Response.json({ ...JSON.parse(String(init?.body)), client_id: 'registered-client' });
      }
      if (url === `${currentIssuer}/token`) {
        tokenRequests.push({ url, body: new URLSearchParams(String(init?.body)) });
        return Response.json({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read',
        });
      }
      throw new Error(`Unexpected OAuth request: ${url}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('discovered MCP OAuth with the v2 SDK', () => {
  it.each(['cimd', 'dynamic'] as const)(
    'persists discovery and PKCE across %s authorization and callback',
    async (method) => {
      registrationMethod = method;
      const start = await beginMcpAuthorization({
        userId: 'user-1',
        connectorId: 'airtable',
        mcpUrl: MCP_URL,
        returnPath: '/connectors',
        scope: 'read',
      });
      expect(start.status).toBe('redirect');
      if (start.status !== 'redirect') throw new Error(JSON.stringify(start));
      const pending = mocks.savePending.mock.calls[0]?.[0] as PendingAuthorization;
      const redirect = new URL(start.authorizationUrl);
      expect(redirect.origin).toBe(ORIGINAL_ISSUER);
      expect(redirect.searchParams.get('state')).toBe(start.state);
      expect(redirect.searchParams.get('client_id')).toBe(
        method === 'cimd' ? resolveClientMetadataUrl() : 'registered-client',
      );
      expect(redirect.searchParams.get('redirect_uri')).toBe(resolveClientRedirectUri());
      expect(redirect.searchParams.get('code_challenge')).toBe(
        createHash('sha256').update(pending.codeVerifier).digest('base64url'),
      );
      expect(pending.discoveryState).toBeDefined();
      expect(pending.issuer).toBe(ORIGINAL_ISSUER);

      const result = await completeMcpAuthorization({
        pending,
        state: start.state,
        code: 'auth-code',
      });
      expect(result).toEqual({
        status: 'connected',
        connectorId: 'airtable',
        grantedScopes: ['read'],
      });
      expect(tokenRequests).toHaveLength(1);
      expect(Object.fromEntries(tokenRequests[0]!.body)).toMatchObject({
        grant_type: 'authorization_code',
        code: 'auth-code',
        code_verifier: pending.codeVerifier,
      });
      expect(mocks.saveGrant).toHaveBeenCalledWith(
        'user-1',
        'airtable',
        expect.objectContaining({
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
          issuer: ORIGINAL_ISSUER,
          mcpUrl: MCP_URL,
        }),
        { accountLabel: null },
      );
    },
  );

  it('refreshes a token only at the issuer that originally granted it', async () => {
    const result = await refreshDiscoveredGrant({
      mcpUrl: MCP_URL,
      issuer: ORIGINAL_ISSUER,
      refreshToken: 'old-refresh',
      tokenType: 'Bearer',
      grantedScopes: ['read'],
    });
    expect(result).toMatchObject({
      status: 'refreshed',
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
    expect(tokenRequests).toHaveLength(1);
    expect(tokenRequests[0]!.url).toBe(`${ORIGINAL_ISSUER}/token`);
    expect(Object.fromEntries(tokenRequests[0]!.body)).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'old-refresh',
    });
  });

  it('never sends a saved refresh token to a changed authorization server', async () => {
    currentIssuer = 'https://other.example.test';
    const result = await refreshDiscoveredGrant({
      mcpUrl: MCP_URL,
      issuer: ORIGINAL_ISSUER,
      refreshToken: 'old-refresh',
      tokenType: 'Bearer',
      grantedScopes: ['read'],
    });
    expect(tokenRequests).toEqual([]);
    expect(result).toEqual({ status: 'authorization-server-changed' });
  });

  it('accepts the SDK trailing-slash tolerance for the same issuer', async () => {
    const result = await refreshDiscoveredGrant({
      mcpUrl: MCP_URL,
      issuer: `${ORIGINAL_ISSUER}/`,
      refreshToken: 'old-refresh',
      tokenType: 'Bearer',
      grantedScopes: [],
    });
    expect(result.status).toBe('refreshed');
    expect(tokenRequests).toHaveLength(1);
  });

  it('requires reconnection before refreshing a grant with no recorded issuer', async () => {
    const result = await refreshDiscoveredGrant({
      mcpUrl: MCP_URL,
      issuer: null,
      refreshToken: 'old-refresh',
      tokenType: 'Bearer',
      grantedScopes: [],
    });
    expect(result.status).toBe('failed');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('starts a dynamic-registration authorization against a local dev redirect base URL', async () => {
    vi.stubEnv('CONNECTOR_OAUTH_REDIRECT_BASE_URL', 'http://localhost:3100');
    registrationMethod = 'dynamic';

    const start = await beginMcpAuthorization({
      userId: 'user-1',
      connectorId: 'stripe',
      mcpUrl: MCP_URL,
      returnPath: '/connectors',
      scope: 'read',
    });

    expect(start.status).toBe('redirect');
    if (start.status !== 'redirect') throw new Error(JSON.stringify(start));
    const redirect = new URL(start.authorizationUrl);
    expect(redirect.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3100/api/connectors/oauth/callback',
    );
    expect(redirect.searchParams.get('client_id')).toBe('registered-client');
    expect(redirect.searchParams.get('code_challenge_method')).toBe('S256');
    expect(redirect.searchParams.get('state')).toBe(start.state);
  });

  it('falls back a CIMD-preferring provider to dynamic registration against a local dev redirect base URL', async () => {
    vi.stubEnv('CONNECTOR_OAUTH_REDIRECT_BASE_URL', 'http://localhost:3100');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url === 'https://mcp.example.test/.well-known/oauth-protected-resource/mcp') {
          return Response.json({ resource: MCP_URL, authorization_servers: [currentIssuer] });
        }
        if (url === `${currentIssuer}/.well-known/oauth-authorization-server`) {
          return Response.json({
            issuer: currentIssuer,
            authorization_endpoint: `${currentIssuer}/authorize`,
            token_endpoint: `${currentIssuer}/token`,
            registration_endpoint: `${currentIssuer}/register`,
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            code_challenge_methods_supported: ['S256'],
            token_endpoint_auth_methods_supported: ['none'],
            client_id_metadata_document_supported: true,
          });
        }
        if (url === `${currentIssuer}/register`) {
          return Response.json({
            ...JSON.parse(String(init?.body)),
            client_id: 'registered-client',
          });
        }
        throw new Error(`Unexpected OAuth request: ${url}`);
      }),
    );

    const start = await beginMcpAuthorization({
      userId: 'user-1',
      connectorId: 'notion',
      mcpUrl: MCP_URL,
      returnPath: '/connectors',
    });

    expect(start.status).toBe('redirect');
    if (start.status !== 'redirect') throw new Error(JSON.stringify(start));
    const redirect = new URL(start.authorizationUrl);
    expect(redirect.searchParams.get('client_id')).toBe('registered-client');
    expect(redirect.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3100/api/connectors/oauth/callback',
    );
    expect(redirect.searchParams.get('code_challenge')).toBeTruthy();
    expect(redirect.searchParams.get('state')).toBe(start.state);
  });
});

describe('documented scope ceilings on the discovered path', () => {
  it('asks only for the ceiling scopes the resource advertises', async () => {
    registrationMethod = 'dynamic';
    resourceScopes = ['read', 'write', 'admin:destroy'];

    const start = await beginMcpAuthorization({
      userId: 'user-1',
      connectorId: 'linear',
      mcpUrl: MCP_URL,
      returnPath: '/connectors',
    });

    expect(start.status).toBe('redirect');
    if (start.status !== 'redirect') throw new Error(JSON.stringify(start));
    const scope = new URL(start.authorizationUrl).searchParams.get('scope');
    expect(scope).toBe('read write');
    const pending = mocks.savePending.mock.calls[0]?.[0] as PendingAuthorization;
    expect(pending.requestedScopes).toEqual(['read', 'write']);
  });

  it('leaves a connector whose ceiling is still under review alone', async () => {
    registrationMethod = 'dynamic';
    resourceScopes = ['read', 'write'];

    const start = await beginMcpAuthorization({
      userId: 'user-1',
      connectorId: 'stripe',
      mcpUrl: MCP_URL,
      returnPath: '/connectors',
    });

    expect(start.status).toBe('redirect');
    if (start.status !== 'redirect') throw new Error(JSON.stringify(start));
    expect(new URL(start.authorizationUrl).searchParams.get('scope')).toBe('read write');
  });

  it('refuses rather than asking for everything when the ceiling matches nothing', async () => {
    registrationMethod = 'dynamic';
    resourceScopes = ['admin:destroy'];

    const start = await beginMcpAuthorization({
      userId: 'user-1',
      connectorId: 'linear',
      mcpUrl: MCP_URL,
      returnPath: '/connectors',
    });

    expect(start.status).toBe('error');
    expect(mocks.savePending).not.toHaveBeenCalled();
  });
});

describe('revoking a discovered grant at its authorization server (RFC 7009)', () => {
  const ISSUER = 'https://auth.vendor.test';
  let metadata: Record<string, unknown>;
  let revocationStatus: number;
  let revocations: { authorization: string | null; body: URLSearchParams }[];
  let requested: string[];

  beforeEach(() => {
    metadata = {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      revocation_endpoint: `${ISSUER}/revoke`,
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    };
    revocationStatus = 200;
    revocations = [];
    requested = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        requested.push(url);
        if (url === `${ISSUER}/.well-known/oauth-authorization-server`) {
          return Response.json(metadata);
        }
        if (url === `${ISSUER}/revoke`) {
          revocations.push({
            authorization: new Headers(init?.headers).get('authorization'),
            body: new URLSearchParams(String(init?.body)),
          });
          return new Response(null, { status: revocationStatus });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  it('revokes the refresh token, then the access token, as the client that obtained them', async () => {
    mocks.getClient.mockResolvedValue({
      issuer: ISSUER,
      clientId: 'https://app.example.test/oauth/client-metadata.json',
      clientSecret: null,
      registrationMethod: 'cimd',
      clientMetadataUrl: 'https://app.example.test/oauth/client-metadata.json',
      clientSecretExpiresAt: null,
    });

    await expect(
      revokeDiscoveredGrant({
        issuer: ISSUER,
        client: null,
        tokens: [
          { token: 'vendor-refresh', tokenTypeHint: 'refresh_token' },
          { token: 'vendor-access', tokenTypeHint: 'access_token' },
        ],
      }),
    ).resolves.toEqual({ status: 'revoked' });

    expect(revocations.map(({ body }) => Object.fromEntries(body))).toEqual([
      {
        token: 'vendor-refresh',
        token_type_hint: 'refresh_token',
        client_id: 'https://app.example.test/oauth/client-metadata.json',
      },
      {
        token: 'vendor-access',
        token_type_hint: 'access_token',
        client_id: 'https://app.example.test/oauth/client-metadata.json',
      },
    ]);
    expect(revocations.every(({ authorization }) => authorization === null)).toBe(true);
  });

  it('authenticates a confidential client the way the server advertises', async () => {
    metadata['revocation_endpoint_auth_methods_supported'] = ['client_secret_basic'];

    await revokeDiscoveredGrant({
      issuer: ISSUER,
      client: { clientId: 'own-client', clientSecret: 'own-secret' },
      tokens: [{ token: 'vendor-refresh', tokenTypeHint: 'refresh_token' }],
    });

    expect(revocations[0]?.authorization).toBe(
      `Basic ${Buffer.from('own-client:own-secret').toString('base64')}`,
    );
    expect(revocations[0]?.body.get('client_secret')).toBeNull();
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it('reports no endpoint, and where to manage access, when the server advertises none', async () => {
    delete metadata['revocation_endpoint'];
    metadata['service_documentation'] = 'https://vendor.test/settings/apps';

    await expect(
      revokeDiscoveredGrant({
        issuer: ISSUER,
        client: { clientId: 'own-client', clientSecret: null },
        tokens: [{ token: 'vendor-refresh', tokenTypeHint: 'refresh_token' }],
      }),
    ).resolves.toEqual({ status: 'unsupported', manageUrl: 'https://vendor.test/settings/apps' });
    expect(revocations).toEqual([]);
  });

  it('reports a failure when the server refuses or errors', async () => {
    revocationStatus = 503;

    await expect(
      revokeDiscoveredGrant({
        issuer: ISSUER,
        client: { clientId: 'own-client', clientSecret: null },
        tokens: [{ token: 'vendor-refresh', tokenTypeHint: 'refresh_token' }],
      }),
    ).resolves.toEqual({ status: 'failed', manageUrl: null });
  });

  it('never sends a token to a revocation endpoint that is not HTTPS', async () => {
    metadata['revocation_endpoint'] = 'http://auth.vendor.test/revoke';

    await expect(
      revokeDiscoveredGrant({
        issuer: ISSUER,
        client: { clientId: 'own-client', clientSecret: null },
        tokens: [{ token: 'vendor-refresh', tokenTypeHint: 'refresh_token' }],
      }),
    ).resolves.toEqual({ status: 'unsupported', manageUrl: null });
    expect(requested.some((url) => url.startsWith('http://'))).toBe(false);
  });

  it('does not contact anything for a grant with no recorded issuer', async () => {
    await expect(
      revokeDiscoveredGrant({
        issuer: null,
        client: null,
        tokens: [{ token: 'vendor-refresh', tokenTypeHint: 'refresh_token' }],
      }),
    ).resolves.toEqual({ status: 'failed', manageUrl: null });
    expect(requested).toEqual([]);
  });
});
