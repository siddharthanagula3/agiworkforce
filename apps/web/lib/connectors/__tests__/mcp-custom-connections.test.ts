import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  close: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@agiworkforce/mcp', () => ({
  connectMcpServer: (...args: unknown[]) => mocks.connect(...args),
}));
vi.mock('@/lib/connectors/mcp-runtime-cache', () => ({
  getMcpStatelessRuntime: vi.fn(async () => ({})),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn() }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn() },
}));

import {
  clearConnectorToolPermissions,
  customConnectorId,
  McpProbeError,
  probeMcpServer,
  transportForUrl,
} from '../mcp-custom-connections';

const TANDEM_TOOLS = [
  'search_docs',
  'get_doc',
  'get_start_path',
  'recommend_next_docs',
  'answer_how_to',
  'get_tandem_guide',
  'warmup_docs_cache',
  'get_docs_cache_status',
  'refresh_docs_index',
  'refresh_doc_page',
  'invalidate_docs_cache',
  'compare_docs_index_refresh',
  'compare_doc_page_refresh',
];

function handleWith(tools: Array<{ toolName: string; visibility: string }>) {
  return {
    protocolEra: 'modern',
    catalog: { tools, resources: [], resourceTemplates: [], prompts: [], apps: [] },
    close: mocks.close,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.close.mockResolvedValue(undefined);
});

describe('probeMcpServer', () => {
  it('lists the tools an open server advertises and closes the handle', async () => {
    mocks.connect.mockResolvedValue(
      handleWith(TANDEM_TOOLS.map((toolName) => ({ toolName, visibility: 'both' }))),
    );

    const result = await probeMcpServer({
      serverName: 'dir-abc',
      url: 'https://tandem.ac/mcp',
      transport: 'streamable-http',
      authorizationContext: 'user:u1:custom-url:https://tandem.ac/mcp',
    });

    expect(result.toolNames).toEqual(TANDEM_TOOLS);
    expect(result.toolCount).toBe(TANDEM_TOOLS.length);
    expect(result.protocolEra).toBe('modern');
    expect(mocks.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        serverName: 'dir-abc',
        config: expect.objectContaining({ url: 'https://tandem.ac/mcp' }),
      }),
    );
    expect(mocks.connect.mock.calls[0]?.[0].config).not.toHaveProperty('headers');
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it('sends the credential header exactly as given and leaves app-only tools out', async () => {
    mocks.connect.mockResolvedValue(
      handleWith([
        { toolName: 'search', visibility: 'model' },
        { toolName: 'widget', visibility: 'app' },
      ]),
    );

    const result = await probeMcpServer({
      serverName: 'dir-abc',
      url: 'https://api.keenable.ai/mcp',
      transport: 'streamable-http',
      headers: { 'X-API-Key': 'kb_example' },
      authorizationContext: 'ctx',
    });

    expect(result.toolNames).toEqual(['search']);
    expect(result.capabilityCounts.tools).toBe(1);
    expect(mocks.connect.mock.calls[0]?.[0].config.headers).toEqual({ 'X-API-Key': 'kb_example' });
  });

  it('marks a 401 as a rejected credential rather than an unreachable server', async () => {
    mocks.connect.mockRejectedValue(
      Object.assign(new Error('HTTP 401'), { code: 401, wwwAuthenticate: 'Bearer realm="x"' }),
    );

    await expect(
      probeMcpServer({
        serverName: 'dir-abc',
        url: 'https://mcp.fodda.ai/mcp',
        transport: 'streamable-http',
        headers: { Authorization: 'Bearer wrong' },
        authorizationContext: 'ctx',
      }),
    ).rejects.toMatchObject({ name: 'McpProbeError', authChallenge: true });
  });

  it('refuses a server that advertises nothing usable', async () => {
    mocks.connect.mockResolvedValue(handleWith([]));

    await expect(
      probeMcpServer({
        serverName: 'dir-abc',
        url: 'https://empty.example.com/mcp',
        transport: 'streamable-http',
        authorizationContext: 'ctx',
      }),
    ).rejects.toBeInstanceOf(McpProbeError);
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });
});

describe('helpers', () => {
  it('derives the chat server id and the transport from the url', () => {
    expect(customConnectorId('abc123')).toBe('custom-abc123');
    expect(transportForUrl(new URL('https://mcp.example.com/sse'))).toBe('sse');
    expect(transportForUrl(new URL('https://mcp.example.com/mcp'))).toBe('streamable-http');
    expect(transportForUrl(new URL('https://mcp.example.com/mcp'), 'sse')).toBe('sse');
  });
});

describe('clearConnectorToolPermissions', () => {
  function transactionalDb(failure?: Error) {
    const calls: Array<{ kind: 'query' | 'execute'; sql: string; params: unknown[] }> = [];
    const transaction = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        calls.push({ kind: 'query', sql, params });
        if (sql.includes('connector_permission_generations')) return [{ generation: '3' }];
        return [{ removed: 2 }];
      }),
      execute: vi.fn(async (sql: string, params: unknown[]) => {
        calls.push({ kind: 'execute', sql, params });
        if (failure) throw failure;
        return 1;
      }),
    };
    const db = {
      transaction: vi.fn(async (run: (tx: typeof transaction) => Promise<unknown>) =>
        run(transaction),
      ),
    };
    return { db: db as unknown as Parameters<typeof clearConnectorToolPermissions>[0], calls };
  }

  it('revokes the conversation grants and deletes the standing verdicts in one transaction', async () => {
    const { db, calls } = transactionalDb();

    await expect(clearConnectorToolPermissions(db, 'user-1', 'linear')).resolves.toBe(true);

    expect(calls.map((call) => call.kind)).toEqual(['query', 'query', 'execute']);
    expect(calls[0]?.sql).toContain('insert into public.connector_permission_generations');
    expect(calls[0]?.sql).toContain('generation + 1');
    expect(calls[0]?.params).toEqual(['user-1', 'linear']);
    expect(calls[1]?.sql).toContain('revoke_connector_tool_session_grants');
    expect(calls[1]?.params).toEqual(['linear', null]);
    expect(calls[2]?.sql).toContain('delete from public.connector_tool_permissions');
    expect(calls[2]?.params).toEqual(['user-1', 'linear']);
  });

  it('reports that nothing was cleared when the transaction fails', async () => {
    const { db } = transactionalDb(new Error('connection lost'));

    await expect(clearConnectorToolPermissions(db, 'user-1', 'linear')).resolves.toBe(false);
  });
});
