// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { remoteRecordFixture } from './directory-record-fixture';

const LIVE = process.env['AGI_TEST_LIVE'] === '1';
const LIVE_TIMEOUT_MS = 60_000;

const mocks = vi.hoisted(() => ({
  clients: new Map<string, unknown>(),
  pendings: [] as unknown[],
  cache: new Map<string, { value: string }>(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn() }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn() },
}));
vi.mock('@/lib/connectors/mcp-runtime-cache', () => ({
  getMcpStatelessRuntime: vi.fn(async () => ({})),
  NeonMcpResponseCacheStore: class {
    async get(key: { params: string }) {
      return mocks.cache.get(key.params);
    }
    async set(key: { params: string }, entry: { value: string }) {
      mocks.cache.set(key.params, entry);
      return 1;
    }
  },
}));
vi.mock('@/lib/connectors/mcp-oauth-clients', () => ({
  getMcpOAuthClient: async (issuer: string) => mocks.clients.get(issuer) ?? null,
  saveMcpOAuthClient: async (record: { issuer: string }) => {
    mocks.clients.set(record.issuer, record);
  },
  deleteMcpOAuthClient: async (issuer: string) => {
    mocks.clients.delete(issuer);
  },
}));
vi.mock('@/lib/connectors/oauth-store', () => ({
  createPendingAuthorization: async (input: unknown) => {
    mocks.pendings.push(input);
  },
  upsertConnectorOAuthGrant: vi.fn(),
}));

import { directoryTargetFor } from '../mcp-directory-targets';
import { McpProbeError, probeMcpServer } from '../mcp-custom-connections';
import { resolveConnectorCredentialSpec } from '../mcp-credential-spec';
import { beginMcpAuthorization, mcpServerRequiresAuthorization } from '../mcp-discovery';

const OPEN = { id: 'ac.tandem/docs-mcp', name: 'Tandem Docs MCP', url: 'https://tandem.ac/mcp' };
const OAUTH = {
  id: 'ch.cowork24/booking',
  name: 'Cowork24',
  url: 'https://mcp.cowork24.ch/mcp',
  issuerOrigin: 'https://mcp.cowork24.ch',
};
const API_KEY = { id: 'ai.fodda/mcp-server', name: 'Fodda', url: 'https://mcp.fodda.ai/mcp' };
const BOGUS_KEY = 'not-a-real-key';
const REDIRECT_BASE = 'https://app.example.test';

// llm-guardrail-allow: live network probes of third party MCP servers, gated by AGI_TEST_LIVE
describe.skipIf(!LIVE)('live directory servers (AGI_TEST_LIVE=1)', () => {
  beforeEach(() => {
    mocks.clients.clear();
    mocks.pendings = [];
    mocks.cache.clear();
    vi.stubEnv('CONNECTOR_OAUTH_REDIRECT_BASE_URL', REDIRECT_BASE);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it(
    'lists the tools of an open server without any credential',
    async () => {
      expect(await mcpServerRequiresAuthorization(OPEN.url)).toBe(false);

      const target = directoryTargetFor(remoteRecordFixture(OPEN.id, OPEN.name, OPEN.url, 'none'))!;
      const probe = await probeMcpServer({
        serverName: target.serverId,
        url: target.mcpUrl,
        transport: target.transport,
        authorizationContext: 'live:open',
      });

      expect(probe.toolCount).toBeGreaterThan(0);
      expect(probe.toolNames).toContain('search_docs');
    },
    LIVE_TIMEOUT_MS,
  );

  it(
    'discovers the authorization server, registers a client dynamically and builds the authorize URL',
    async () => {
      expect(await mcpServerRequiresAuthorization(OAUTH.url)).toBe(true);

      const started = await beginMcpAuthorization({
        userId: 'live-user',
        connectorId: OAUTH.id,
        mcpUrl: OAUTH.url,
        returnPath: '/connectors',
      });

      expect(started.status).toBe('redirect');
      if (started.status !== 'redirect') throw new Error(JSON.stringify(started));
      const authorize = new URL(started.authorizationUrl);
      expect(authorize.origin).toBe(OAUTH.issuerOrigin);
      expect(authorize.searchParams.get('redirect_uri')).toBe(
        `${REDIRECT_BASE}/api/connectors/oauth/callback`,
      );
      expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
      expect(authorize.searchParams.get('state')).toBe(started.state);
      expect(authorize.searchParams.get('client_id')).toBeTruthy();
      expect(mocks.clients.size).toBe(1);
      expect(mocks.pendings).toHaveLength(1);
    },
    LIVE_TIMEOUT_MS,
  );

  it(
    'reads the credential header from the registry and sees the server reject a bogus key',
    async () => {
      const target = directoryTargetFor(
        remoteRecordFixture(API_KEY.id, API_KEY.name, API_KEY.url, 'api-key'),
      )!;

      const spec = await resolveConnectorCredentialSpec(target);
      expect(spec).toMatchObject({
        headerName: 'Authorization',
        valuePrefix: 'Bearer ',
        placement: 'header',
        source: 'registry',
      });

      await expect(
        probeMcpServer({
          serverName: target.serverId,
          url: target.mcpUrl,
          transport: target.transport,
          headers: { [spec.headerName]: `${spec.valuePrefix}${BOGUS_KEY}` },
          authorizationContext: 'live:api-key',
        }),
      ).rejects.toBeInstanceOf(McpProbeError);
    },
    LIVE_TIMEOUT_MS,
  );
});
