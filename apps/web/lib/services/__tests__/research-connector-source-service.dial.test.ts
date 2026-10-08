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
});
