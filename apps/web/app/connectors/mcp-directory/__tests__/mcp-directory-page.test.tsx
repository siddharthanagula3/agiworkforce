import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLI_AVAILABILITY_NOTE } from '@/lib/surface-status';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';
import {
  COMMUNITY_VIEW_NOTICE,
  DEFAULT_VIEW_LINK_LABEL,
  SHORT_LIST_COMMUNITY_LINK_LABEL,
  SHORT_LIST_NOTICE,
  directoryRecordPath,
} from '../directory-public';

const getSnapshotViewMock = vi.hoisted(() => vi.fn());

type MemoryCacheModule = typeof import('@/lib/connectors/directory/memory-cache');

vi.mock('@/lib/connectors/directory/memory-cache', async (importOriginal) => ({
  ...(await importOriginal<MemoryCacheModule>()),
  getSnapshotView: getSnapshotViewMock,
}));
vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/system/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import McpDirectoryPage from '../page';

const PAGE_SIZE = 60;
const LONG_NAME = 'A'.repeat(60);
const BASE_PATH = '/connectors/mcp-directory';

function record(overrides: Partial<DirectoryRecord> = {}): DirectoryRecord {
  const id = overrides.id ?? 'linear';
  return {
    id,
    name: 'Linear',
    publisher: 'Linear',
    description: 'Issues, projects and cycles.',
    categories: ['Productivity'],
    remotes: [{ url: `https://${id}.example/mcp`, transport: 'streamable-http' }],
    authMode: 'oauth',
    connectable: 'connect',
    toolNames: ['list_issues', 'create_issue'],
    repositoryUrl: null,
    version: null,
    sourceRegistry: 'internal',
    badge: 'first-party',
    iconUrl: `https://${id}.example/icon.png`,
    monogram: 'LI',
    documentationUrl: null,
    iconSource: 'registry',
    brandSlug: null,
    authorName: null,
    authorUrl: null,
    websiteUrl: null,
    supportUrl: null,
    privacyPolicyUrl: null,
    ...overrides,
  };
}

function snapshot(records: readonly DirectoryRecord[], bootstrapComplete = true) {
  return {
    records,
    counts: {
      totalRecords: records.length,
      remoteRecords: records.length,
      byConnectable: {},
      byBadge: {},
    },
    bootstrapComplete,
    lastSyncAt: null,
  };
}

async function renderPage(params: Record<string, string> = {}) {
  const page = await McpDirectoryPage({ searchParams: Promise.resolve(params) });
  return render(page);
}

function manyRecords(count: number): DirectoryRecord[] {
  return Array.from({ length: count }, (_, index) =>
    record({ id: `connector-${index}`, name: `Connector ${index}`, categories: ['Code'] }),
  );
}

beforeEach(() => {
  getSnapshotViewMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('McpDirectoryPage', () => {
  it('narrows by search and keeps the category in every link', async () => {
    getSnapshotViewMock.mockResolvedValue(
      snapshot([
        record({ id: 'linear', name: 'Linear', categories: ['Productivity'] }),
        record({ id: 'github', name: 'GitHub', categories: ['Code'] }),
        record({ id: 'gitlab', name: 'GitLab', categories: ['Code'] }),
      ]),
    );

    await renderPage({ q: 'git', category: 'Code' });

    expect(screen.getByRole('heading', { level: 3, name: 'GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'GitLab' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Linear' })).not.toBeInTheDocument();
    expect(screen.getByText('2 connectors')).toBeInTheDocument();

    const input = screen.getByLabelText('Search connectors', { selector: 'input' });
    expect(input).toHaveValue('git');
    const select = screen.getByLabelText('Category', { selector: 'select' });
    expect(select).toHaveValue('Code');

    const pills = within(screen.getByRole('navigation', { name: 'Categories' })).getAllByRole(
      'link',
    );
    expect(pills.every((pill) => pill.getAttribute('href')?.includes('q=git'))).toBe(true);
    const selectedPill = pills.find((pill) => pill.getAttribute('aria-current') === 'page');
    expect(selectedPill).toHaveTextContent('Code');
    expect(selectedPill?.className).toContain('aria-[current=page]:border-foreground');
    expect(selectedPill?.className).toContain('aria-[current=page]:font-medium');
  });

  it('shows the active filters and a clear link only when filtered', async () => {
    getSnapshotViewMock.mockResolvedValue(snapshot([record()]));

    const { unmount } = await renderPage({ q: 'linear', category: 'Productivity' });
    expect(screen.getByText('Matching "linear" in Productivity.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', BASE_PATH);
    unmount();

    await renderPage();
    expect(screen.queryByRole('link', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('says how many it shows when more than the page size match', async () => {
    getSnapshotViewMock.mockResolvedValue(snapshot(manyRecords(PAGE_SIZE + 5)));

    await renderPage();

    expect(
      screen.getByText(`${PAGE_SIZE + 5} connectors, showing the first ${PAGE_SIZE}`),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(PAGE_SIZE);
    const note = screen.getByText(/Showing the first 60 of 65\./);
    expect(note).toHaveTextContent(
      'Search or choose a category to narrow the list, or sign in to browse all of them.',
    );
    expect(within(note).getByRole('link', { name: 'sign in' })).toHaveAttribute(
      'href',
      '/login?redirectTo=%2Fconnectors',
    );
    expect(document.body.textContent).not.toMatch(/sign in to search/i);
  });

  it('omits the limit note when everything fits on the page', async () => {
    getSnapshotViewMock.mockResolvedValue(snapshot(manyRecords(PAGE_SIZE)));

    await renderPage();

    expect(screen.getByText(`${PAGE_SIZE} connectors`)).toBeInTheDocument();
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();
  });

  it('shows the empty message with a clear link when nothing matches', async () => {
    getSnapshotViewMock.mockResolvedValue(snapshot([record()]));

    await renderPage({ q: 'zzzz-nonsense' });

    expect(screen.getByText('No indexed connector matches that search yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clear filters' })).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('says the index is incomplete while bootstrap is running', async () => {
    getSnapshotViewMock.mockResolvedValue(snapshot([record()], false));

    await renderPage({ q: 'zzzz-nonsense' });

    expect(
      screen.getByText(
        'The directory is still being indexed, so this search may be incomplete. Try again shortly.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('0 connectors indexed so far')).toBeInTheDocument();
  });

  it('keeps a long name readable with a title and a two-line clamp', async () => {
    getSnapshotViewMock.mockResolvedValue(snapshot([record({ name: LONG_NAME })]));

    await renderPage();

    const name = screen.getByRole('heading', { level: 3, name: LONG_NAME });
    expect(name).toHaveAttribute('title', LONG_NAME);
    expect(name.className).toContain('line-clamp-2');
    expect(name.className).not.toContain('truncate');
  });

  it('shows the monogram when a record has no icon', async () => {
    getSnapshotViewMock.mockResolvedValue(snapshot([record({ iconUrl: null, monogram: 'LN' })]));

    await renderPage();

    const card = screen.getByRole('listitem');
    expect(card.querySelector('img')).toBeNull();
    expect(card).toHaveTextContent('LN');
  });

  it('links every card name to its details and names the publisher', async () => {
    getSnapshotViewMock.mockResolvedValue(
      snapshot([
        record({ id: 'linear', name: 'Linear', badge: 'registry' }),
        record({ id: 'org/github', name: 'GitHub', publisher: 'GitHub, Inc.', badge: 'community' }),
      ]),
    );

    await renderPage({ view: 'community' });

    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      const heading = within(card).getByRole('heading', { level: 3 });
      const action = within(heading).getByRole('link', { name: heading.textContent ?? '' });
      const id = heading.textContent === 'Linear' ? 'linear' : 'org/github';
      expect(action).toHaveAttribute('href', directoryRecordPath(id));
      expect(within(card).getAllByRole('link')).toHaveLength(1);
    }
    expect(cards[1]).toHaveTextContent('Community');
    expect(cards[1]).toHaveTextContent('GitHub, Inc.');
    expect(cards[1]).toHaveTextContent('2 tools');
  });

  it('marks the selected category in both the select and the pills', async () => {
    getSnapshotViewMock.mockResolvedValue(snapshot([record({ categories: ['Code'] })]));

    await renderPage({ category: 'Code' });

    expect(screen.getByLabelText('Category', { selector: 'select' })).toHaveValue('Code');
    const nav = screen.getByRole('navigation', { name: 'Categories' });
    const current = within(nav)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Code');
  });

  it('prints the CLI availability from the registry and never a released CLI', async () => {
    getSnapshotViewMock.mockResolvedValue(snapshot([record()]));

    await renderPage();

    expect(document.body.textContent).toContain(CLI_AVAILABILITY_NOTE);
    expect(document.body.textContent).not.toMatch(/released CLI/i);
    expect(document.body.textContent).not.toMatch(/public Desktop/i);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Find a connector for your work.',
    );
  });

  describe('listing policy', () => {
    const community = (overrides: Partial<DirectoryRecord>) =>
      record({ badge: 'registry', sourceRegistry: 'mcp-registry', ...overrides });

    it('hides unchecked community entries by default and says why the list is short', async () => {
      getSnapshotViewMock.mockResolvedValue(
        snapshot([record(), community({ id: 'unchecked', name: 'Unchecked Server' })]),
      );

      await renderPage();

      expect(screen.queryByRole('heading', { level: 3, name: 'Unchecked Server' })).toBeNull();
      expect(screen.getByText(SHORT_LIST_NOTICE, { exact: false })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: SHORT_LIST_COMMUNITY_LINK_LABEL })).toHaveAttribute(
        'href',
        `${BASE_PATH}?view=community`,
      );
    });

    it('shows eligible community entries in the community view and keeps the view in links', async () => {
      getSnapshotViewMock.mockResolvedValue(
        snapshot([record(), community({ id: 'unchecked', name: 'Unchecked Server' })]),
      );

      await renderPage({ view: 'community' });

      expect(
        screen.getByRole('heading', { level: 3, name: 'Unchecked Server' }),
      ).toBeInTheDocument();
      expect(screen.getByText(COMMUNITY_VIEW_NOTICE, { exact: false })).toBeInTheDocument();
      expect(screen.queryByText(SHORT_LIST_NOTICE, { exact: false })).toBeNull();
      expect(screen.getByRole('link', { name: DEFAULT_VIEW_LINK_LABEL })).toHaveAttribute(
        'href',
        BASE_PATH,
      );
      const pills = within(screen.getByRole('navigation', { name: 'Categories' })).getAllByRole(
        'link',
      );
      expect(pills.every((pill) => pill.getAttribute('href')?.includes('view=community'))).toBe(
        true,
      );
    });

    it('never shows an API-key server or an unchecked money-moving one, even in the community view', async () => {
      getSnapshotViewMock.mockResolvedValue(
        snapshot([
          community({
            id: 'keyed',
            name: 'Keyed Server',
            authMode: 'api-key',
            connectable: 'api-key-form',
          }),
          community({ id: 'broker', name: 'Broker Server', description: 'Place trades.' }),
        ]),
      );

      await renderPage({ view: 'community' });

      expect(screen.queryByRole('heading', { level: 3, name: 'Keyed Server' })).toBeNull();
      expect(screen.queryByRole('heading', { level: 3, name: 'Broker Server' })).toBeNull();
    });

    it('drops the short-list notice once the default list is long enough', async () => {
      getSnapshotViewMock.mockResolvedValue(snapshot(manyRecords(PAGE_SIZE)));
      await renderPage();
      expect(screen.queryByText(SHORT_LIST_NOTICE, { exact: false })).toBeNull();
    });
  });
});
