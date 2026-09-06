import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  pendings: [] as Row[],
  grants: [] as Row[],
  mcpConnects: [] as Array<{ serverName: string; config: Record<string, unknown> }>,
  toolCalls: [] as Array<{ toolName: string; args: Record<string, unknown> }>,
  closedHandles: 0,
  fetches: [] as Array<{ url: string; body: string }>,
  tokenResponse: {
    access_token: 'acme-access-1',
    refresh_token: 'acme-refresh-1',
    token_type: 'Bearer',
    scope: 'read write',
    expires_in: 3600,
  } as Record<string, unknown>,
}));

function hashState(state: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:crypto').createHash('sha256').update(state).digest('hex');
}

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
  getClientIp: vi.fn(),
  logRateLimitExceeded: vi.fn(async () => undefined),
}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })) }));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/github-app', () => ({
  getGitHubAppInstallUrl: vi.fn(() => null),
  isGitHubAppConfigured: vi.fn(() => false),
  isGitHubInstallationLinkingAvailable: vi.fn(() => false),
  missingGitHubInstallationLinkingVars: vi.fn(() => ['GITHUB_APP_ID']),
  getInstallationAccessToken: vi.fn(),
  getPrDiff: vi.fn(),
  postIssueComment: vi.fn(),
  postPrReview: vi.fn(),
}));
vi.mock('@/lib/egress-policy', async (importOriginal) => ({
  ...(await importOriginal()),
  assertResolvedPublicHostname: vi.fn(async () => undefined),
  EgressPolicyError: class EgressPolicyError extends Error {},
}));

vi.mock('@agiworkforce/mcp', () => {
  const catalog = {
    version: 1,
    generatedAt: 0,
    servers: {},
    tools: [
      {
        serverName: 'acme',
        toolName: 'list_records',
        description: 'Read records.',
        fallbackDescription: 'Read records.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
      {
        serverName: 'acme',
        toolName: 'create_record',
        description: 'Write a record.',
        fallbackDescription: 'Write a record.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
    ],
  };
  const makeHandle = (serverName: string, config: Record<string, unknown>) => {
    mocks.mcpConnects.push({ serverName, config });
    return {
      serverName,
      catalog: { ...catalog, servers: {} },
      callTool: async (toolName: string, args: Record<string, unknown>) => {
        mocks.toolCalls.push({ toolName, args });
        return { isError: false, content: [{ type: 'text', text: `ok:${toolName}` }] };
      },
      close: async () => {
        mocks.closedHandles += 1;
      },
    };
  };
  return {
    connectMcpServer: async ({
      serverName,
      config,
    }: {
      serverName: string;
      config: Record<string, unknown>;
    }) => makeHandle(serverName, config),
    buildMcpToolCatalog: async (servers: Record<string, Record<string, unknown>>) => {
      const handles = Object.entries(servers).map(([name, config]) => makeHandle(name, config));
      return {
        catalog: {
          ...catalog,
          tools: catalog.tools.map((t) => ({ ...t, serverName: Object.keys(servers)[0]! })),
        },
        handles,
      };
    },
  };
});

vi.mock('@/lib/server/neon-db', () => {
  const nowMs = () => Date.now();
  const run = (sql: string, params: unknown[] = []): Row[] => {
    const q = sql.replace(/\s+/g, ' ').trim();

    if (q.startsWith('delete from public.connector_oauth_authorizations')) {
      const [userId, connectorId] = params as [string, string];
      mocks.pendings = mocks.pendings.filter(
        (p) =>
          !(
            p['user_id'] === userId &&
            (Number(p['expires_at_ms']) < nowMs() ||
              p['consumed'] === true ||
              p['connector_id'] === connectorId)
          ),
      );
      return [];
    }
    if (q.startsWith('insert into public.connector_oauth_authorizations')) {
      const [
        userId,
        connectorId,
        stateHash,
        verifierEnc,
        method,
        redirectUri,
        scopes,
        returnPath,
        expiresAt,
      ] = params as [string, string, string, string, string, string, string[], string, string];
      mocks.pendings.push({
        user_id: userId,
        connector_id: connectorId,
        state_hash: stateHash,
        code_verifier_enc: verifierEnc,
        code_challenge_method: method,
        redirect_uri: redirectUri,
        requested_scopes: scopes,
        return_path: returnPath,
        expires_at_ms: new Date(expiresAt).getTime(),
        consumed: false,
      });
      return [];
    }
    if (q.startsWith('update public.connector_oauth_authorizations')) {
      const [stateHash] = params as [string];
      const row = mocks.pendings.find(
        (p) =>
          p['state_hash'] === stateHash &&
          p['consumed'] === false &&
          Number(p['expires_at_ms']) > nowMs(),
      );
      if (!row) return [];
      row['consumed'] = true;
      return [row];
    }
    if (q.startsWith('insert into public.connector_oauth_grants')) {
      const [
        userId,
        connectorId,
        accessEnc,
        refreshEnc,
        tokenType,
        scopes,
        expiresAt,
        tokenEndpoint,
      ] = params as [
        string,
        string,
        string,
        string | null,
        string,
        string[],
        string | null,
        string,
      ];
      const existing = mocks.grants.find(
        (g) => g['user_id'] === userId && g['connector_id'] === connectorId,
      );
      const row: Row = {
        user_id: userId,
        connector_id: connectorId,
        access_token_enc: accessEnc,
        refresh_token_enc: refreshEnc,
        token_type: tokenType,
        granted_scopes: scopes,
        access_token_expires_at: expiresAt,
        token_endpoint: tokenEndpoint,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        revoked_at: null,
      };
      if (existing) Object.assign(existing, row);
      else mocks.grants.push(row);
      return [];
    }
    if (q.startsWith('update public.connector_oauth_grants set revoked_at')) {
      const [userId, connectorId] = params as [string, string];
      const row = mocks.grants.find(
        (g) =>
          g['user_id'] === userId && g['connector_id'] === connectorId && g['revoked_at'] === null,
      );
      if (!row) return [];
      row['revoked_at'] = new Date().toISOString();
      row['access_token_enc'] = null;
      row['refresh_token_enc'] = null;
      return [{ connector_id: connectorId }];
    }
    if (q.startsWith('update public.connector_oauth_grants set access_token_enc')) {
      const [userId, connectorId, accessEnc, refreshEnc, tokenType, scopes, expiresAt] = params as [
        string,
        string,
        string,
        string | null,
        string,
        string[],
        string | null,
      ];
      const row = mocks.grants.find(
        (g) =>
          g['user_id'] === userId && g['connector_id'] === connectorId && g['revoked_at'] === null,
      );
      if (!row) return [];
      row['access_token_enc'] = accessEnc;
      if (refreshEnc) row['refresh_token_enc'] = refreshEnc;
      row['token_type'] = tokenType;
      row['granted_scopes'] = scopes;
      row['access_token_expires_at'] = expiresAt;
      return [];
    }
    if (q.startsWith('select connector_id, access_token_enc')) {
      const [userId, connectorId] = params as [string, string];
      return mocks.grants.filter(
        (g) =>
          g['user_id'] === userId && g['connector_id'] === connectorId && g['revoked_at'] === null,
      );
    }
    if (q.startsWith('select connector_id, granted_scopes')) {
      const [userId] = params as [string];
      return mocks.grants.filter((g) => g['user_id'] === userId && g['revoked_at'] === null);
    }
    return [];
  };
  const adapter = {
    query: async (sql: string, params?: unknown[]) => run(sql, params),
    execute: async (sql: string, params?: unknown[]) => {
      run(sql, params);
      return 0;
    },
    transaction: async (callback: (tx: unknown) => unknown) => callback(adapter),
  };
  return { getNeonDb: vi.fn(() => adapter) };
});

vi.mock('@/lib/server/rls-db', async () => {
  const { getNeonDb } = await import('@/lib/server/neon-db');
  return {
    getUserScopedDb: vi.fn(async () => ({
      db: getNeonDb(),
      userId: 'user-1',
      organizationId: null,
    })),
    getCurrentUserRlsDb: vi.fn(async () => ({ db: getNeonDb(), userId: 'user-1' })),
  };
});

import { GET as OAUTH_START } from '@/app/api/connectors/oauth/start/route';
import { GET as OAUTH_CALLBACK } from '@/app/api/connectors/oauth/callback/route';
import { DELETE as CONNECTORS_DELETE, GET as CONNECTORS_GET } from '@/app/api/connectors/route';
import { __resetConnectorOAuthRegistryCacheForTests } from '@/lib/connectors/oauth-registry';
import { resolveConnectorAccessToken } from '@/lib/connectors/oauth-access';
import {
  evictConnectorOAuthCaches,
  loadUserConnectorToolDefs,
  makeUserConnectorExecutor,
} from '@/lib/user-connector-tools';

const APP_ORIGIN = 'https://app.example.com';
const PROVIDER_DESCRIPTOR = {
  providers: [
    {
      connectorId: 'acme',
      displayName: 'Acme',
      authorizationUrl: 'https://acme.example.com/oauth/authorize',
      tokenUrl: 'https://acme.example.com/oauth/token',
      revocationUrl: 'https://acme.example.com/oauth/revoke',
      mcpUrl: 'https://acme.example.com/mcp',
      scopes: ['read', 'write'],
    },
  ],
};

function setOperatorConfiguration(): void {
  process.env['CONNECTOR_OAUTH_PROVIDERS_JSON'] = JSON.stringify(PROVIDER_DESCRIPTOR);
  process.env['CONNECTOR_OAUTH_ACME_CLIENT_ID'] = 'client-abc';
  process.env['CONNECTOR_OAUTH_ACME_CLIENT_SECRET'] = 'secret-xyz';
  process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] = APP_ORIGIN;
  __resetConnectorOAuthRegistryCacheForTests();
}

async function completeAuthorization(): Promise<{ state: string; redirectUri: string }> {
  const start = await OAUTH_START(
    new NextRequest(`${APP_ORIGIN}/api/connectors/oauth/start?connectorId=acme&mode=json`),
  );
  const body = (await start.json()) as { authorizeUrl: string };
  const authorizeUrl = new URL(body.authorizeUrl);
  const state = authorizeUrl.searchParams.get('state')!;
  const redirectUri = authorizeUrl.searchParams.get('redirect_uri')!;

  const callback = await OAUTH_CALLBACK(
    new NextRequest(
      `${APP_ORIGIN}/api/connectors/oauth/callback?code=auth-code-1&state=${encodeURIComponent(state)}`,
    ),
  );
  expect(callback.status).toBe(307);
  return { state, redirectUri };
}

describe('CRIT-001, an available connector completes the whole lifecycle', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pendings = [];
    mocks.grants = [];
    mocks.mcpConnects = [];
    mocks.toolCalls = [];
    mocks.closedHandles = 0;
    mocks.fetches = [];
    mocks.tokenResponse = {
      access_token: 'acme-access-1',
      refresh_token: 'acme-refresh-1',
      token_type: 'Bearer',
      scope: 'read write',
      expires_in: 3600,
    };
    process.env['CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY'] = 'a'.repeat(64);
    process.env['NEXT_PUBLIC_APP_URL'] = APP_ORIGIN;
    setOperatorConfiguration();

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const body = init?.body === undefined ? '' : String(init.body);
      mocks.fetches.push({ url, body });
      if (url.includes('/oauth/token')) {
        return new Response(JSON.stringify(mocks.tokenResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/oauth/revoke')) return new Response('', { status: 200 });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await evictConnectorOAuthCaches('user-1', 'acme');
    delete process.env['CONNECTOR_OAUTH_PROVIDERS_JSON'];
    delete process.env['CONNECTOR_OAUTH_ACME_CLIENT_ID'];
    delete process.env['CONNECTOR_OAUTH_ACME_CLIENT_SECRET'];
    delete process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'];
    __resetConnectorOAuthRegistryCacheForTests();
  });

  it('authorizes, stores an encrypted grant, and reports the connector connected', async () => {
    const { state, redirectUri } = await completeAuthorization();

    expect(redirectUri).toBe(`${APP_ORIGIN}/api/connectors/oauth/callback`);
    expect(mocks.pendings).toHaveLength(1);
    expect(mocks.pendings[0]!['state_hash']).toBe(hashState(state));
    expect(mocks.pendings[0]!['code_verifier_enc']).not.toContain('acme');

    expect(mocks.grants).toHaveLength(1);
    const grant = mocks.grants[0]!;
    expect(grant['granted_scopes']).toEqual(['read', 'write']);
    expect(String(grant['access_token_enc'])).not.toContain('acme-access-1');
    expect(String(grant['refresh_token_enc'])).not.toContain('acme-refresh-1');

    const listed = (await (
      await CONNECTORS_GET(new NextRequest(`${APP_ORIGIN}/api/connectors`))
    ).json()) as {
      connectors: Array<{ connectorId: string; source: string; health?: string }>;
      available: string[];
    };
    expect(listed.available).toContain('acme');
    expect(listed.connectors).toContainEqual(
      expect.objectContaining({ connectorId: 'acme', source: 'oauth', health: 'connected' }),
    );
  });

  it('turns the stored grant into discovered tools carrying the real credential', async () => {
    await completeAuthorization();

    const tools = await loadUserConnectorToolDefs('user-1');
    const names = tools.map((t) => t.qualifiedName);
    expect(names).toContain('mcp__acme__list_records');
    expect(names).toContain('mcp__acme__create_record');

    const connect = mocks.mcpConnects.find((c) => c.serverName === 'acme');
    expect(connect?.config).toMatchObject({
      url: 'https://acme.example.com/mcp',
      headers: expect.objectContaining({ Authorization: 'Bearer acme-access-1' }),
    });
  });

  it('executes a read action and a write action through the granted credential', async () => {
    await completeAuthorization();
    const execute = makeUserConnectorExecutor('user-1');

    const read = await execute('acme', 'list_records', {});
    expect(read).toMatchObject({ handled: true, isError: false });
    expect(read.content).toContain('ok:list_records');

    const write = await execute('acme', 'create_record', { title: 'hello' });
    expect(write).toMatchObject({ handled: true, isError: false });
    expect(mocks.toolCalls).toEqual([
      { toolName: 'list_records', args: {} },
      { toolName: 'create_record', args: { title: 'hello' } },
    ]);
  });

  it('refreshes an expired access token instead of asking the user to reconnect', async () => {
    await completeAuthorization();
    mocks.grants[0]!['access_token_expires_at'] = new Date(Date.now() - 1000).toISOString();
    mocks.tokenResponse = {
      access_token: 'acme-access-2',
      token_type: 'Bearer',
      scope: 'read write',
      expires_in: 3600,
    };

    const access = await resolveConnectorAccessToken('user-1', 'acme');

    expect(access).toMatchObject({ status: 'ready', accessToken: 'acme-access-2' });
    expect(mocks.fetches.some((f) => f.body.includes('grant_type=refresh_token'))).toBe(true);
  });

  it('reports reauthorization required, then drops the grant that cannot be renewed', async () => {
    await completeAuthorization();
    mocks.grants[0]!['access_token_expires_at'] = new Date(Date.now() - 1000).toISOString();
    mocks.grants[0]!['refresh_token_enc'] = null;

    const listBefore = (await (
      await CONNECTORS_GET(new NextRequest(`${APP_ORIGIN}/api/connectors`))
    ).json()) as { connectors: Array<{ connectorId: string; health?: string }> };
    expect(listBefore.connectors.find((c) => c.connectorId === 'acme')?.health).toBe(
      'needs-reauthorization',
    );

    const access = await resolveConnectorAccessToken('user-1', 'acme');
    expect(access).toEqual({ status: 'reauthorization-required', reason: 'expired' });
    expect(mocks.grants[0]!['revoked_at']).not.toBeNull();

    const listAfter = (await (
      await CONNECTORS_GET(new NextRequest(`${APP_ORIGIN}/api/connectors`))
    ).json()) as { connectors: Array<{ connectorId: string }>; available: string[] };
    expect(listAfter.connectors.find((c) => c.connectorId === 'acme')).toBeUndefined();
    expect(listAfter.available).toContain('acme');
  });

  it('disconnect revokes at the provider, destroys the ciphertext, and stops tool calls', async () => {
    await completeAuthorization();
    await makeUserConnectorExecutor('user-1')('acme', 'list_records', {});
    expect(mocks.closedHandles).toBe(1);
    const closedAfterStatelessCall = mocks.closedHandles;

    const response = await CONNECTORS_DELETE(
      new NextRequest(`${APP_ORIGIN}/api/connectors?connectorId=acme`, { method: 'DELETE' }),
    );
    expect(response.status).toBe(200);

    expect(mocks.fetches.some((f) => f.url.includes('/oauth/revoke'))).toBe(true);
    expect(mocks.grants[0]!['revoked_at']).not.toBeNull();
    expect(mocks.grants[0]!['access_token_enc']).toBeNull();
    expect(mocks.closedHandles).toBe(closedAfterStatelessCall);

    expect(await loadUserConnectorToolDefs('user-1')).toEqual([]);
    const afterDisconnect = await makeUserConnectorExecutor('user-1')('acme', 'list_records', {});
    expect(afterDisconnect).toMatchObject({ handled: true, isError: true });

    const listed = (await (
      await CONNECTORS_GET(new NextRequest(`${APP_ORIGIN}/api/connectors`))
    ).json()) as { connectors: Array<{ connectorId: string }> };
    expect(listed.connectors.find((c) => c.connectorId === 'acme')).toBeUndefined();
  });

  it('reauthorizing after a disconnect issues a fresh grant, not the old one', async () => {
    await completeAuthorization();
    await CONNECTORS_DELETE(
      new NextRequest(`${APP_ORIGIN}/api/connectors?connectorId=acme`, { method: 'DELETE' }),
    );

    mocks.tokenResponse = {
      access_token: 'acme-access-3',
      refresh_token: 'acme-refresh-3',
      token_type: 'Bearer',
      scope: 'read',
      expires_in: 3600,
    };
    await completeAuthorization();

    const access = await resolveConnectorAccessToken('user-1', 'acme');
    expect(access).toMatchObject({ status: 'ready', accessToken: 'acme-access-3' });
    expect(mocks.grants[0]!['revoked_at']).toBeNull();
    expect(mocks.grants[0]!['granted_scopes']).toEqual(['read']);
  });

  it('offers nothing once the operator de-configures the provider', async () => {
    await completeAuthorization();

    delete process.env['CONNECTOR_OAUTH_ACME_CLIENT_SECRET'];
    __resetConnectorOAuthRegistryCacheForTests();

    const listed = (await (
      await CONNECTORS_GET(new NextRequest(`${APP_ORIGIN}/api/connectors`))
    ).json()) as { connectors: Array<{ connectorId: string }>; available: string[] };
    expect(listed.available).not.toContain('acme');
    expect(listed.connectors.find((c) => c.connectorId === 'acme')).toBeUndefined();
    expect(await loadUserConnectorToolDefs('user-1')).toEqual([]);
  });
});
