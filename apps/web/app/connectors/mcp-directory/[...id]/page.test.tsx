import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { directoryRecordFixture } from '@/lib/connectors/__tests__/directory-record-fixture';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';
import { computeDirectoryCounts } from '@/lib/connectors/directory/snapshot-view';
import { absoluteUrl } from '@/lib/seo/site';
import { directoryRecordPath, NOT_PROVIDED } from '../directory-public';

const { getSnapshotRecords, getSnapshotView, notFound } = vi.hoisted(() => ({
  getSnapshotRecords: vi.fn(),
  getSnapshotView: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('not found');
  }),
}));

type MemoryCacheModule = typeof import('@/lib/connectors/directory/memory-cache');

vi.mock('@/lib/connectors/directory/memory-cache', async (importOriginal) => ({
  ...(await importOriginal<MemoryCacheModule>()),
  getSnapshotRecords,
  getSnapshotView,
}));
vi.mock('next/navigation', () => ({ notFound }));
vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/system/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import ConnectorDetailPage, { generateMetadata } from './page';

function record(overrides: Partial<DirectoryRecord> = {}) {
  return directoryRecordFixture({
    id: 'org/linear',
    name: 'Linear',
    publisher: 'Linear, Inc.',
    authorName: 'Linear',
    authorUrl: 'https://publisher.example/author',
    description: 'Manage issues and projects.',
    connectable: 'connect',
    authMode: 'oauth',
    toolNames: ['list_issues', 'create_issue'],
    remotes: [{ url: 'https://connector.example/mcp?token=private', transport: 'streamable-http' }],
    documentationUrl: 'https://publisher.example/docs',
    websiteUrl: 'https://publisher.example/',
    repositoryUrl: 'https://publisher.example/source',
    supportUrl: 'https://publisher.example/support',
    privacyPolicyUrl: 'https://publisher.example/privacy',
    ...overrides,
  });
}

function snapshot(records: DirectoryRecord[]) {
  getSnapshotRecords.mockResolvedValue(records);
  getSnapshotView.mockResolvedValue({
    records,
    counts: computeDirectoryCounts(records),
    bootstrapComplete: true,
    lastSyncAt: '2026-10-04T18:00:00.000Z',
  });
}

function props(id = 'org/linear') {
  return { params: Promise.resolve({ id: id.split('/') }) };
}

async function renderPage(id?: string) {
  return render(await ConnectorDetailPage(props(id)));
}

beforeEach(() => {
  vi.clearAllMocks();
  snapshot([record()]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('public connector details', () => {
  it('renders the snapshot fields, tools and a sign-in action without connecting', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Linear' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in to connect' })).toHaveAttribute(
      'href',
      '/login?redirectTo=%2Fconnectors',
    );
    const ledger = screen.getByRole('list', { name: 'The record' });
    expect(ledger).toHaveTextContent('Linear, Inc.');
    expect(ledger).toHaveTextContent('Official MCP registry');
    expect(ledger).toHaveTextContent('OAuth sign-in with the provider');
    expect(ledger).toHaveTextContent('connector.example');
    expect(ledger).not.toHaveTextContent('token=private');
    expect(ledger).toHaveTextContent('2026-10-04T18:00:00.000Z');
    expect(ledger).toHaveTextContent('not a review of this connector');
    for (const label of [
      'Documentation',
      'Website',
      'Source repository',
      'Support',
      'Privacy policy',
    ]) {
      expect(within(ledger).getByRole('link', { name: label })).toHaveAttribute(
        'rel',
        'nofollow noopener noreferrer',
      );
    }
    expect(screen.getByText('list_issues')).toBeInTheDocument();
    expect(screen.getByText('create_issue')).toBeInTheDocument();
    expect(document.body.textContent).toContain('Reading this page connects nothing.');
    expect(document.body.textContent).not.toMatch(/\bCLI\b|\bDesktop\b/);
    expect(getSnapshotView).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows honest missing values and rejects unsafe publisher links', async () => {
    snapshot([
      record({
        authorName: null,
        authorUrl: null,
        authMode: 'unknown',
        description: '',
        documentationUrl: 'javascript:alert(1)',
        websiteUrl: null,
        repositoryUrl: null,
        supportUrl: null,
        privacyPolicyUrl: null,
        toolNames: [],
      }),
    ]);
    await renderPage();

    expect(screen.getByText('The publisher has not provided a description.')).toBeInTheDocument();
    expect(screen.getByText('Tool list not published.')).toBeInTheDocument();
    expect(screen.getByText('Not checked yet')).toBeInTheDocument();
    const ledger = screen.getByRole('list', { name: 'The record' });
    expect(within(ledger).queryAllByRole('link')).toHaveLength(0);
    expect(within(ledger).getAllByText(NOT_PROVIDED)).toHaveLength(6);
  });

  it.each(['missing', '%E0%A4%A'])('returns not found for %s', async (id) => {
    await expect(ConnectorDetailPage(props(id))).rejects.toThrow('not found');
    expect(notFound).toHaveBeenCalledOnce();
  });

  it('returns not found for a record the public list cannot connect', async () => {
    snapshot([record({ connectable: 'needs-setup' })]);
    await expect(ConnectorDetailPage(props())).rejects.toThrow('not found');
  });

  it('resolves a slash-containing id encoded by a card link', async () => {
    snapshot([record({ id: 'org/a server%' })]);
    const encoded = directoryRecordPath('org/a server%').split('/').slice(3);
    render(await ConnectorDetailPage({ params: Promise.resolve({ id: encoded }) }));
    expect(screen.getByRole('heading', { level: 1, name: 'Linear' })).toBeInTheDocument();
  });
});

describe('connector detail metadata', () => {
  it('uses the canonical record path for a complete record', async () => {
    const metadata = await generateMetadata(props());
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe(absoluteUrl(directoryRecordPath('org/linear')));
  });

  it.each([{ description: '' }, { documentationUrl: null, websiteUrl: null, repositoryUrl: null }])(
    'keeps thin records out of search indexes',
    async (overrides) => {
      snapshot([record(overrides)]);
      expect((await generateMetadata(props())).robots).toEqual({ index: false, follow: true });
    },
  );

  it('keeps unknown records out of search indexes', async () => {
    expect((await generateMetadata(props('missing'))).robots).toEqual({
      index: false,
      follow: false,
    });
  });
});
