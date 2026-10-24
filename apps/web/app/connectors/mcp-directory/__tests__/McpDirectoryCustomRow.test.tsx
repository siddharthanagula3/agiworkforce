import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DirectoryRecord } from '@/lib/connectors/directory/types';

const getSnapshotViewMock = vi.hoisted(() => vi.fn());

type MemoryCacheModule = typeof import('@/lib/connectors/directory/memory-cache');
type DirectoryPublicModule = typeof import('../directory-public');

vi.mock('@/lib/connectors/directory/memory-cache', async (importOriginal) => ({
  ...(await importOriginal<MemoryCacheModule>()),
  getSnapshotView: getSnapshotViewMock,
}));
vi.mock('../directory-public', async (importOriginal) => ({
  ...(await importOriginal<DirectoryPublicModule>()),
  CONNECTORS_RELEASED: true,
}));
vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/system/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import McpDirectoryPage from '../page';

const linear: DirectoryRecord = {
  id: 'linear',
  name: 'Linear',
  publisher: 'Linear',
  description: 'Issues, projects and cycles.',
  categories: ['Productivity'],
  remotes: [{ url: 'https://linear.example/mcp', transport: 'streamable-http' }],
  authMode: 'oauth',
  connectable: 'connect',
  toolNames: [],
  repositoryUrl: null,
  version: null,
  sourceRegistry: 'internal',
  badge: 'first-party',
  iconUrl: null,
  monogram: 'LI',
  documentationUrl: null,
  iconSource: 'registry',
  brandSlug: null,
  authorName: null,
  authorUrl: null,
  websiteUrl: null,
  supportUrl: null,
  privacyPolicyUrl: null,
};

afterEach(cleanup);

describe('McpDirectoryPage once connectors are released', () => {
  it('offers a custom connector row that leads to the signed-in connector flow', async () => {
    getSnapshotViewMock.mockResolvedValue({
      records: [linear],
      counts: { totalRecords: 1, remoteRecords: 1, byConnectable: {}, byBadge: {} },
      bootstrapComplete: true,
      lastSyncAt: null,
    });

    render(await McpDirectoryPage({ searchParams: Promise.resolve({}) }));

    const row = screen.getByTestId('mcp-directory-custom-row');
    expect(row).toHaveAttribute('href', '/login?redirectTo=%2Fconnectors');
    expect(row).toHaveTextContent('Custom connector');
    expect(row).toHaveTextContent('Add any remote MCP server by its URL.');
  });
});
