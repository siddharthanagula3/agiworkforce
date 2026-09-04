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

import {
  getCachedToolNames,
  setCachedToolNames,
} from '@/lib/connectors/directory/tool-names-cache';

describe('getCachedToolNames', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when nothing is cached for the connector', async () => {
    mocks.query.mockResolvedValueOnce([]);
    await expect(getCachedToolNames('notion')).resolves.toBeNull();
  });

  it('parses the cached tool name list', async () => {
    mocks.query.mockResolvedValueOnce([
      { value: JSON.stringify(['a', 'b']), stamp: '1', expires_at_ms: null, scope: 'public' },
    ]);
    await expect(getCachedToolNames('notion')).resolves.toEqual(['a', 'b']);
  });
});

describe('setCachedToolNames', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes under a key scoped to the connector id, not the whole snapshot', async () => {
    mocks.query.mockResolvedValueOnce([{ stamp: '1' }]);

    await setCachedToolNames('notion', ['a', 'b']);

    const params = mocks.query.mock.calls[0]?.[1] as unknown[];
    expect(params[0]).toBe('connectors.directory.tool-names');
    expect(params[1]).toBe('notion');
    expect(params[3]).toBe(JSON.stringify(['a', 'b']));
  });
});
