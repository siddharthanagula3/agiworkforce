import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  resolveDirectoryTarget: vi.fn(),
  withRateLimit: vi.fn(async (..._args: unknown[]) => null),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (...args: unknown[]) => mocks.withRateLimit(...args),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mocks.query }),
}));
vi.mock('@/lib/connectors/catalog', () => ({
  isKnownConnectorId: (id: string) => ['gmail', 'google-drive', 'slack'].includes(id),
}));
vi.mock('@/lib/connectors/mcp-directory-targets', () => ({
  resolveDirectoryTarget: (id: string) => mocks.resolveDirectoryTarget(id),
}));

import { GET } from '../route';
import { rankConnectorsByConnections, resetConnectorPopularityCache } from '../ranking';

function request(): NextRequest {
  return new NextRequest('http://localhost:3000/api/connectors/directory/popularity');
}

beforeEach(() => {
  vi.clearAllMocks();
  resetConnectorPopularityCache();
  mocks.resolveDirectoryTarget.mockImplementation(async (id: string) =>
    id === 'srv-canva' ? { connectorId: 'canva' } : null,
  );
});

describe('rankConnectorsByConnections', () => {
  it('maps server ids to directory ids, drops unknown ids and zero counts, and ranks by count', async () => {
    const ranked = await rankConnectorsByConnections([
      { connector_id: 'gmail', connections: '12' },
      { connector_id: 'srv-canva', connections: 5 },
      { connector_id: 'private-server', connections: 99 },
      { connector_id: 'slack', connections: 0 },
      { connector_id: 'google-drive', connections: 30 },
    ]);
    expect(ranked).toEqual(['google-drive', 'gmail', 'canva']);
  });

  it('returns at most the contract limit', async () => {
    mocks.resolveDirectoryTarget.mockImplementation(async (id: string) => ({ connectorId: id }));
    const rows = Array.from({ length: 14 }, (_, index) => ({
      connector_id: `c${String(index).padStart(2, '0')}`,
      connections: 100 - index,
    }));
    expect(await rankConnectorsByConnections(rows)).toHaveLength(10);
  });
});

describe('GET /api/connectors/directory/popularity', () => {
  it('returns only the ranked ids, with no counts or account data', async () => {
    mocks.query.mockResolvedValue([
      { connector_id: 'gmail', connections: 3 },
      { connector_id: 'slack', connections: 7 },
    ]);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ranked: ['slack', 'gmail'] });
    expect(response.headers.get('Cache-Control')).toContain('public');
  });

  it('answers with no ranking and no cache when the counts cannot be read', async () => {
    mocks.query.mockRejectedValue(new Error('function does not exist'));
    const response = await GET(request());
    expect(await response.json()).toEqual({ ranked: [] });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('reuses a fresh ranking instead of querying again', async () => {
    mocks.query.mockResolvedValue([{ connector_id: 'gmail', connections: 1 }]);
    await GET(request());
    await GET(request());
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});
