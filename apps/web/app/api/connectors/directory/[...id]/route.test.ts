import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  readDirectorySnapshot: vi.fn(),
  upsertDirectoryRecord: vi.fn(),
  resolveAuthModeForRecord: vi.fn(async (record: unknown) => record),
  getClerkAuthUser: vi.fn(async (..._args: unknown[]): Promise<{ userId: string }> => {
    throw new Error('unauthorized');
  }),
  discoverAndCacheToolNames: vi.fn(
    async (..._args: unknown[]): Promise<readonly string[] | null> => null,
  ),
  resolveSiteIconForRecord: vi.fn(async (record: unknown) => record),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/connectors/directory/snapshot-cache', () => ({
  readDirectorySnapshot: () => mocks.readDirectorySnapshot(),
  upsertDirectoryRecord: (...args: unknown[]) => mocks.upsertDirectoryRecord(...args),
}));
vi.mock('@/lib/connectors/directory/auth-probe', () => ({
  resolveAuthModeForRecord: (record: unknown) => mocks.resolveAuthModeForRecord(record),
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mocks.getClerkAuthUser(...args),
}));
vi.mock('@/lib/connectors/directory/tool-discovery', () => ({
  discoverAndCacheToolNames: (...args: unknown[]) => mocks.discoverAndCacheToolNames(...args),
}));
vi.mock('@/lib/connectors/directory/favicon-probe', () => ({
  pendingSiteIconSource: (record: { iconSource: string; iconUrl: string | null }) =>
    record.iconSource === 'site' && record.iconUrl === null,
  resolveSiteIconForRecord: (record: unknown) => mocks.resolveSiteIconForRecord(record),
}));

import { GET } from './route';

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 'io.github.someone/tool',
    name: 'Some Tool',
    publisher: 'someone',
    description: 'A community connector.',
    categories: ['Other'],
    remotes: [{ url: 'https://tool.example.com/mcp', transport: 'streamable-http' }],
    authMode: 'unknown',
    connectable: 'needs-setup',
    toolNames: [],
    repositoryUrl: null,
    version: '1.0.0',
    sourceRegistry: 'mcp-registry',
    badge: 'community',
    iconUrl: null,
    monogram: 'ST',
    documentationUrl: null,
    iconSource: 'monogram',
    brandSlug: null,
    authorName: null,
    authorUrl: null,
    websiteUrl: null,
    supportUrl: null,
    privacyPolicyUrl: null,
    ...overrides,
  };
}

function context(id: string) {
  return { params: Promise.resolve({ id: id.split('/') }) };
}

function request(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/connectors/directory/${path}`);
}

describe('GET /api/connectors/directory/[...id]', () => {
  it('returns 404 for an id not present in the snapshot', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce({ records: [] });

    const response = await GET(request('missing'), context('missing'));
    expect(response.status).toBe(404);
  });

  it('joins a multi-segment catch-all id back with a slash', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce({ records: [record()] });

    const response = await GET(
      request('io.github.someone/tool'),
      context('io.github.someone/tool'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entry.id).toBe('io.github.someone/tool');
  });

  it('resolves and persists an unknown auth mode before returning', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce({ records: [record()] });
    mocks.resolveAuthModeForRecord.mockResolvedValueOnce(
      record({ authMode: 'oauth', connectable: 'connect' }),
    );

    const response = await GET(
      request('io.github.someone/tool'),
      context('io.github.someone/tool'),
    );
    const body = await response.json();

    expect(body.entry.authMode).toBe('oauth');
    expect(mocks.upsertDirectoryRecord).toHaveBeenCalledTimes(1);
  });

  it('skips tool discovery for an anonymous caller', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce({
      records: [record({ authMode: 'oauth', connectable: 'connect' })],
    });

    await GET(request('io.github.someone/tool'), context('io.github.someone/tool'));

    expect(mocks.discoverAndCacheToolNames).not.toHaveBeenCalled();
  });

  it('discovers and returns live tool names for a signed-in caller', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce({
      records: [record({ authMode: 'oauth', connectable: 'connect' })],
    });
    mocks.getClerkAuthUser.mockResolvedValueOnce({ userId: 'user-1' });
    mocks.discoverAndCacheToolNames.mockResolvedValueOnce(['list_items', 'create_item']);

    const response = await GET(
      request('io.github.someone/tool'),
      context('io.github.someone/tool'),
    );
    const body = await response.json();

    expect(body.entry.toolNames).toEqual(['list_items', 'create_item']);
  });

  it('resolves and persists a pending site icon before returning', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce({
      records: [
        record({ authMode: 'oauth', connectable: 'connect', iconSource: 'site', iconUrl: null }),
      ],
    });
    mocks.resolveSiteIconForRecord.mockResolvedValueOnce(
      record({
        authMode: 'oauth',
        connectable: 'connect',
        iconSource: 'site',
        iconUrl: 'https://tool.example.com/favicon.ico',
      }),
    );

    const response = await GET(
      request('io.github.someone/tool'),
      context('io.github.someone/tool'),
    );
    const body = await response.json();

    expect(body.entry.iconUrl).toBe('https://tool.example.com/favicon.ico');
    expect(mocks.upsertDirectoryRecord).toHaveBeenCalledTimes(1);
  });

  it('never touches an already-resolved icon source', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce({
      records: [record({ authMode: 'oauth', connectable: 'connect', iconSource: 'brand' })],
    });

    await GET(request('io.github.someone/tool'), context('io.github.someone/tool'));

    expect(mocks.resolveSiteIconForRecord).not.toHaveBeenCalled();
  });

  it('carries a computed tool count and connector url in the detail response', async () => {
    mocks.readDirectorySnapshot.mockResolvedValueOnce({
      records: [
        record({
          authMode: 'oauth',
          connectable: 'connect',
          toolNames: ['a', 'b'],
          remotes: [{ url: 'https://tool.example.com/mcp', transport: 'streamable-http' }],
        }),
      ],
    });

    const response = await GET(
      request('io.github.someone/tool'),
      context('io.github.someone/tool'),
    );
    const body = await response.json();

    expect(body.entry.toolCount).toBe(2);
    expect(body.entry.connectorUrl).toBe('https://tool.example.com/mcp');
  });
});
