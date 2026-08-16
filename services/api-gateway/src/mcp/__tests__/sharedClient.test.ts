
import { describe, expect, it, vi } from 'vitest';

import { closeAllSharedMcpHandles, getSharedMcpCatalog } from '../sharedClient';

vi.mock('../mcpConfig', () => ({
  loadMcpConfig: () => [],
  getServerEntry: () => undefined,
}));

describe('sharedClient', () => {
  it('returns an empty catalog when no servers are configured', async () => {
    const catalog = await getSharedMcpCatalog(0);
    expect(catalog.tools).toEqual([]);
    expect(catalog.servers).toEqual({});
    expect(catalog.version).toBe(1);
  });

  it('closeAllSharedMcpHandles resolves without error when no handles open', async () => {
    await expect(closeAllSharedMcpHandles()).resolves.toBeUndefined();
  });
});
