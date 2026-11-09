import { beforeEach, describe, expect, it, vi } from 'vitest';

type UserConnectorToolsModule = typeof import('@/lib/user-connector-tools');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  loadCatalog: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('@/lib/user-connector-tools', async (importOriginal) => ({
  ...(await importOriginal<UserConnectorToolsModule>()),
  loadUserConnectorToolCatalog: mocks.loadCatalog,
  makeUserConnectorExecutor: () => mocks.execute,
}));

import { readResearchConnectorSources } from '../research-connector-source-service';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadCatalog.mockResolvedValue({ tools: [], dropped: [], limit: null });
});

describe('readResearchConnectorSources', () => {
  it('contacts only the connectors the research plan picked', async () => {
    await readResearchConnectorSources({
      userId: 'user-1',
      organizationId: null,
      planTier: 'pro',
      connectorIds: ['notion'],
      queries: ['quarterly plan'],
      isToolDenied: () => false,
      googleUserDataRouted: false,
    });

    const options = mocks.loadCatalog.mock.calls[0]?.[1] as {
      isConnectorDenied: (connectorId: string) => boolean;
    };
    expect(options.isConnectorDenied('notion')).toBe(false);
    expect(options.isConnectorDenied('slack')).toBe(true);
  });

  describe('when a connector answers some searches and not others', () => {
    const searchCatalog = {
      tools: [{ serverId: 'notion', serverLabel: 'Notion', toolName: 'search' }],
      dropped: [],
      limit: null,
    };
    const answer = (url: string) => ({
      handled: true,
      isError: false,
      content: JSON.stringify({ results: [{ url, title: 'Plan', text: 'Q3 plan' }] }),
    });
    const read = () =>
      readResearchConnectorSources({
        userId: 'user-1',
        organizationId: null,
        planTier: 'pro',
        connectorIds: ['notion'],
        queries: ['first question', 'second question'],
        isToolDenied: () => false,
        googleUserDataRouted: false,
      });

    beforeEach(() => {
      mocks.loadCatalog.mockResolvedValue(searchCatalog);
    });

    it('reports a returned error as a partial read and keeps the hit', async () => {
      mocks.execute
        .mockResolvedValueOnce(answer('https://notion.so/a'))
        .mockResolvedValueOnce({ handled: true, isError: true, content: 'provider error' });

      const [outcome] = await read();

      expect(outcome).toMatchObject({
        outcome: 'partial',
        searchesAsked: 2,
        searchesAnswered: 1,
        sources: [{ url: 'https://notion.so/a' }],
      });
    });

    it('reports a thrown second search as a partial read', async () => {
      mocks.execute
        .mockResolvedValueOnce(answer('https://notion.so/a'))
        .mockRejectedValueOnce(new Error('timeout'));

      const [outcome] = await read();

      expect(outcome).toMatchObject({ outcome: 'partial', searchesAnswered: 1 });
    });

    it('reports every answered search as a plain read', async () => {
      mocks.execute
        .mockResolvedValueOnce(answer('https://notion.so/a'))
        .mockResolvedValueOnce(answer('https://notion.so/b'));

      const [outcome] = await read();

      expect(outcome).toMatchObject({ outcome: 'read', searchesAnswered: 2 });
      expect(outcome?.sources).toHaveLength(2);
    });

    it('reports no answered search as failed', async () => {
      mocks.execute.mockResolvedValue({ handled: true, isError: true, content: 'provider error' });

      const [outcome] = await read();

      expect(outcome).toMatchObject({ outcome: 'failed', sources: [] });
    });
  });
});
