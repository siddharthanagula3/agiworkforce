import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  fetchRegistryPage,
  isLatestActiveEntry,
  MCP_REGISTRY_BASE_URL,
  RegistryFetchError,
  type RegistryPage,
} from '@/lib/connectors/directory/registry-client';

const RECORDED_REAL_PAGE: RegistryPage = {
  servers: [
    {
      server: {
        name: 'ai.smithery/smithery-ai-slack',
        description:
          'Enable interaction with Slack workspaces. Supports subscribing to Slack events through Resources.',
        version: '1.0.0',
        repository: { url: 'https://github.com/smithery-ai/mcp-servers', source: 'github' },
        remotes: [
          {
            type: 'streamable-http',
            url: 'https://server.smithery.ai/@smithery-ai/slack/mcp',
            headers: [
              {
                name: 'Authorization',
                description: 'Bearer token for Smithery authentication',
                isRequired: true,
                isSecret: true,
                value: 'Bearer {smithery_api_key}',
              },
            ],
          },
        ],
      },
      _meta: {
        'io.modelcontextprotocol.registry/official': {
          status: 'active',
          isLatest: true,
        },
      },
    },
    {
      server: {
        name: 'ac.inference.sh/mcp',
        description:
          'Run 150+ AI apps: image, video, audio, LLMs, 3D and more. Browse, execute, stream results.',
        title: 'inference.sh',
        version: '1.0.0',
        remotes: [
          { type: 'streamable-http', url: 'https://sh.inference.ac' },
          { type: 'streamable-http', url: 'https://api.inference.sh/mcp' },
        ],
      },
      _meta: {
        'io.modelcontextprotocol.registry/official': {
          status: 'active',
          isLatest: false,
        },
      },
    },
  ],
  metadata: { count: 2, nextCursor: 'ac.inference.sh/mcp:1.0.0' },
};

describe('fetchRegistryPage', () => {
  it('requests the v0 servers endpoint with a bounded page limit', async () => {
    const fetchImpl = vi.fn(
      async (..._args: unknown[]) =>
        new Response(JSON.stringify(RECORDED_REAL_PAGE), { status: 200 }),
    );

    const page = await fetchRegistryPage(null, fetchImpl as unknown as typeof fetch);

    expect(page).toEqual(RECORDED_REAL_PAGE);
    const requestedUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestedUrl.origin).toBe(new URL(MCP_REGISTRY_BASE_URL).origin);
    expect(requestedUrl.pathname).toBe('/v0/servers');
    expect(requestedUrl.searchParams.get('limit')).toBe('100');
    expect(requestedUrl.searchParams.has('cursor')).toBe(false);
  });

  it('forwards a cursor for the next page', async () => {
    const fetchImpl = vi.fn(
      async (..._args: unknown[]) =>
        new Response(JSON.stringify(RECORDED_REAL_PAGE), { status: 200 }),
    );

    await fetchRegistryPage(
      'ai.smithery/smithery-ai-slack:1.0.0',
      fetchImpl as unknown as typeof fetch,
    );

    const requestedUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestedUrl.searchParams.get('cursor')).toBe('ai.smithery/smithery-ai-slack:1.0.0');
  });

  it('throws a typed error on a non-ok response', async () => {
    const fetchImpl = vi.fn(
      async (..._args: unknown[]) => new Response('rate limited', { status: 429 }),
    );

    await expect(
      fetchRegistryPage(null, fetchImpl as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(RegistryFetchError);
  });
});

describe('isLatestActiveEntry', () => {
  it('accepts an active, latest-tagged entry', () => {
    expect(isLatestActiveEntry(RECORDED_REAL_PAGE.servers[0]!)).toBe(true);
  });

  it('rejects a superseded version of the same server', () => {
    expect(isLatestActiveEntry(RECORDED_REAL_PAGE.servers[1]!)).toBe(false);
  });

  it('rejects an entry with no official metadata at all', () => {
    expect(isLatestActiveEntry({ server: RECORDED_REAL_PAGE.servers[0]!.server })).toBe(false);
  });
});
