import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  NeonMcpResponseCacheStore,
  loadMcpPriorDiscovery,
  mcpAuthorizationContext,
  mcpResponseCachePartitionKey,
  purgeMcpResponseCachePartitions,
  saveMcpDiscovery,
  sweepExpiredMcpDiscoveryCache,
  sweepExpiredMcpResponseCache,
} from '../mcp-runtime-cache';

describe('stateless MCP persistent cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('round-trips the official SDK cache entry fields without interpreting the value', async () => {
    mocks.query.mockResolvedValueOnce([
      {
        value: '{"tools":[]}',
        stamp: '41',
        expires_at_ms: '1800000000000',
        scope: 'private',
      },
    ]);
    const store = new NeonMcpResponseCacheStore();

    await expect(
      store.get({ method: 'tools/list', partition: '["server","principal"]' }),
    ).resolves.toEqual({
      value: '{"tools":[]}',
      stamp: 41,
      expiresAt: 1_800_000_000_000,
      scope: 'private',
    });
  });

  it('uses a database sequence as the monotonic write stamp', async () => {
    mocks.query.mockResolvedValueOnce([{ stamp: '42' }]);
    const store = new NeonMcpResponseCacheStore();

    await expect(
      store.set(
        { method: 'resources/read', params: 'docs://one', partition: 'partition' },
        { value: '{"contents":[]}', expiresAt: 1_800_000_000_000, scope: 'public' },
      ),
    ).resolves.toBe(42);

    expect(String(mocks.query.mock.calls[0]?.[0])).toContain(
      "nextval('public.mcp_response_cache_stamp_seq')",
    );
  });

  it('fails open during an ordered schema rollout without leaking cache entries', async () => {
    mocks.query.mockRejectedValueOnce(
      Object.assign(new Error('relation does not exist'), { code: '42P01' }),
    );
    const store = new NeonMcpResponseCacheStore();

    await expect(store.get({ method: 'tools/list' })).resolves.toBeUndefined();
  });

  it('reads only the stamp column, not the value', async () => {
    mocks.query.mockResolvedValueOnce([{ stamp: '7' }]);
    const store = new NeonMcpResponseCacheStore();

    await expect(store.getStamp({ method: 'tools/list', params: 'v1' })).resolves.toBe(7);
    expect(String(mocks.query.mock.calls[0]?.[0])).not.toContain('value');
  });

  it('returns null for a stamp on a missing key', async () => {
    mocks.query.mockResolvedValueOnce([]);
    const store = new NeonMcpResponseCacheStore();

    await expect(store.getStamp({ method: 'tools/list', params: 'v1' })).resolves.toBeNull();
  });

  it('treats a missing table as no stamp rather than an error', async () => {
    mocks.query.mockRejectedValueOnce(
      Object.assign(new Error('relation does not exist'), { code: '42P01' }),
    );
    const store = new NeonMcpResponseCacheStore();

    await expect(store.getStamp({ method: 'tools/list', params: 'v1' })).resolves.toBeNull();
  });

  it('partitions persisted discovery by a hash of both endpoint and authorization context', async () => {
    mocks.execute.mockResolvedValue(undefined);
    const discover = {
      protocolVersion: '2026-07-28',
      capabilities: { tools: {} },
    } as never;

    await saveMcpDiscovery('https://mcp.example.com/mcp', 'user:one', discover);
    await saveMcpDiscovery('https://mcp.example.com/mcp', 'user:two', discover);

    const firstParams = mocks.execute.mock.calls[0]?.[1] as unknown[];
    const secondParams = mocks.execute.mock.calls[1]?.[1] as unknown[];
    expect(firstParams[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(firstParams[1]).toMatch(/^[0-9a-f]{64}$/);
    expect(firstParams[1]).not.toBe(secondParams[1]);
    expect(firstParams).not.toContain('user:one');
  });

  it('loads only a fresh modern discovery verdict', async () => {
    mocks.query.mockResolvedValueOnce([
      { discover_result: { protocolVersion: '2026-07-28', capabilities: {} } },
    ]);

    await expect(loadMcpPriorDiscovery('https://mcp.example.com/mcp', 'user:one')).resolves.toEqual(
      {
        kind: 'modern',
        discover: { protocolVersion: '2026-07-28', capabilities: {} },
      },
    );
  });
});

describe('cached MCP response bodies are reachable and expire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('will not serve a body whose expiry has passed', async () => {
    mocks.query.mockResolvedValueOnce([]);

    await new NeonMcpResponseCacheStore().get({ method: 'tools/list', partition: 'p' });

    const [sql, values] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('expires_at_ms is null or expires_at_ms >=');
    expect(typeof values[3]).toBe('number');
  });

  it('deletes every row of the partitions a disconnect names, once each', async () => {
    mocks.query.mockResolvedValueOnce([{ partition_key: 'a' }, { partition_key: 'b' }]);
    const context = mcpAuthorizationContext.userCustomConnector('user_1', 'row-1');

    const deleted = await purgeMcpResponseCachePartitions([context, context]);

    expect(deleted).toBe(2);
    const [sql, values] = mocks.query.mock.calls[0] as [string, unknown[][]];
    expect(sql).toContain('partition_key = any($1::text[])');
    expect(values[0]).toEqual([mcpResponseCachePartitionKey(context)]);
  });

  it('asks for nothing when no context was named', async () => {
    await expect(purgeMcpResponseCachePartitions([])).resolves.toBe(0);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('sweeps only the rows whose expiry has passed', async () => {
    mocks.query.mockResolvedValueOnce([{ partition_key: 'a' }]);

    await expect(sweepExpiredMcpResponseCache(1_700_000_000_000)).resolves.toBe(1);

    const [sql, values] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('expires_at_ms is not null and expires_at_ms < $1');
    expect(values).toEqual([1_700_000_000_000]);
  });

  it('reports nothing swept when the cache table is not provisioned', async () => {
    mocks.query.mockRejectedValue(Object.assign(new Error('missing'), { code: '42P01' }));

    await expect(sweepExpiredMcpResponseCache()).resolves.toBe(0);
    await expect(sweepExpiredMcpDiscoveryCache()).resolves.toBe(0);
    await expect(
      purgeMcpResponseCachePartitions([mcpAuthorizationContext.operatorConnector('github')]),
    ).resolves.toBe(0);
  });

  it('gives each authorization context its own partition digest', () => {
    const first = mcpResponseCachePartitionKey(
      mcpAuthorizationContext.userOauthConnector('user_1', 'github'),
    );
    const second = mcpResponseCachePartitionKey(
      mcpAuthorizationContext.userOauthConnector('user_2', 'github'),
    );

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
  });
});
