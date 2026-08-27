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
  saveMcpDiscovery,
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
