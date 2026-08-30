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

import {
  beginMcpAuthorization,
  completeMcpAuthorization,
  refreshDiscoveredGrant,
} from '../mcp-discovery';
import { resolveClientMetadataUrl, resolveClientRedirectUri } from '../mcp-client-metadata';
import type { PendingAuthorization } from '../oauth-store';
import type { McpOAuthClientRecord } from '../mcp-oauth-clients';

const MCP_URL = 'https://mcp.example.test/mcp';
const ORIGINAL_ISSUER = 'https://auth.example.test';
let currentIssuer: string;
let registrationMethod: 'cimd' | 'dynamic';
let tokenRequests: { url: string; body: URLSearchParams }[];

beforeEach(() => {
  currentIssuer = ORIGINAL_ISSUER;
  registrationMethod = 'cimd';
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
        return Response.json({ resource: MCP_URL, authorization_servers: [currentIssuer] });
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
});
