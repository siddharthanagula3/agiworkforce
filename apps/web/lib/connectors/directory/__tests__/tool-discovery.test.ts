import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withUserConnectorMcpHandle: vi.fn(),
  getCachedToolNames: vi.fn(),
  setCachedToolNames: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/user-connector-tools', () => ({
  withUserConnectorMcpHandle: (...args: unknown[]) => mocks.withUserConnectorMcpHandle(...args),
}));
vi.mock('@/lib/connectors/directory/tool-names-cache', () => ({
  getCachedToolNames: (...args: unknown[]) => mocks.getCachedToolNames(...args),
  setCachedToolNames: (...args: unknown[]) => mocks.setCachedToolNames(...args),
}));

import { discoverAndCacheToolNames } from '@/lib/connectors/directory/tool-discovery';

describe('discoverAndCacheToolNames', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the already-known tool names without touching the cache or the mcp client', async () => {
    await expect(discoverAndCacheToolNames('user-1', 'notion', ['a', 'b'])).resolves.toEqual([
      'a',
      'b',
    ]);
    expect(mocks.getCachedToolNames).not.toHaveBeenCalled();
    expect(mocks.withUserConnectorMcpHandle).not.toHaveBeenCalled();
  });

  it('returns a previously cached discovery without calling the live mcp client', async () => {
    mocks.getCachedToolNames.mockResolvedValueOnce(['a', 'b']);

    await expect(discoverAndCacheToolNames('user-1', 'notion', [])).resolves.toEqual(['a', 'b']);
    expect(mocks.withUserConnectorMcpHandle).not.toHaveBeenCalled();
  });

  it('discovers live and caches under the connector id only, not the snapshot', async () => {
    mocks.getCachedToolNames.mockResolvedValueOnce(null);
    mocks.withUserConnectorMcpHandle.mockResolvedValueOnce(['a', 'b']);

    const result = await discoverAndCacheToolNames('user-1', 'notion', []);

    expect(result).toEqual(['a', 'b']);
    expect(mocks.setCachedToolNames).toHaveBeenCalledWith('notion', ['a', 'b']);
  });

  it('returns null when the connector is not connected for this user', async () => {
    mocks.getCachedToolNames.mockResolvedValueOnce(null);
    mocks.withUserConnectorMcpHandle.mockResolvedValueOnce(null);

    await expect(discoverAndCacheToolNames('user-1', 'notion', [])).resolves.toBeNull();
    expect(mocks.setCachedToolNames).not.toHaveBeenCalled();
  });
});
