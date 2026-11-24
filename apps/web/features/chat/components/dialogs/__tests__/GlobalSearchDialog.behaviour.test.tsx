import { useState } from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
type ScanModule0 = typeof import('next/navigation');
type ScanModule1 = typeof import('@shared/stores/authentication-store');
type ScanModule2 = typeof import('../../../services/global-search-service');
type DesktopHostModule = typeof import('@/features/desktop-host');

const service = vi.hoisted(() => ({
  search: vi.fn(),
  getRecentSearches: vi.fn(),
  getPopularSearches: vi.fn(),
  clearSearchHistory: vi.fn(),
}));
const desktop = vi.hoisted(() => ({ host: null as object | null, list: vi.fn() }));

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<DesktopHostModule>()),
  useDesktopHost: () => desktop.host,
  listDeveloperSessions: desktop.list,
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@shared/stores/authentication-store', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  useAuthStore: () => ({ user: { id: 'fixture-user' } }),
}));
vi.mock('../../../services/global-search-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  globalSearchService: service,
}));

import { GlobalSearchDialog } from '../GlobalSearchDialog';

const EMPTY_RESULTS = {
  results: [],
  stats: { totalResults: 0, searchTime: 4, conversationCount: 0, messageCount: 0 },
};

beforeEach(() => {
  desktop.host = null;
  desktop.list.mockReset();
  service.search.mockReset().mockResolvedValue(EMPTY_RESULTS);
  service.getRecentSearches.mockReset().mockResolvedValue([]);
  service.getPopularSearches.mockReset().mockResolvedValue([]);
  service.clearSearchHistory.mockReset().mockResolvedValue(0);
});
afterEach(cleanup);

describe('GlobalSearchDialog', () => {
  it('searches Local Code session titles on the device and clears the query before Cloud search', async () => {
    desktop.host = {};
    const session = {
      id: 'thread',
      rootId: 'root',
      title: 'Private workspace review',
      createdAt: '2026-11-24T00:00:00Z',
      updatedAt: '2026-11-24T00:00:00Z',
    };
    desktop.list.mockResolvedValue({
      groups: [
        {
          name: 'Project',
          sessions: [
            session,
            { ...session, id: 'archived', title: 'Private archived review', archivedAt: 1 },
          ],
        },
      ],
    });
    const user = userEvent.setup();
    render(<GlobalSearchDialog open onOpenChange={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Local Code' }));
    const input = screen.getByRole('textbox', { name: 'Search Local Code session titles' });
    await user.type(input, 'private');

    expect(await screen.findByRole('button', { name: /Private workspace review/ })).toBeVisible();
    expect(screen.queryByText('Private archived review')).toBeNull();
    expect(desktop.list).toHaveBeenCalledExactlyOnceWith({ titleQuery: 'private' });
    expect(service.search).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Code' }));
    expect(screen.getByRole('textbox', { name: 'Search your workspace' })).toHaveValue('');
    expect(screen.queryByText('Private workspace review')).toBeNull();
    expect(service.search).not.toHaveBeenCalled();
  });

  it('searches the selected category without losing the typed query', async () => {
    const user = userEvent.setup();
    render(<GlobalSearchDialog open onOpenChange={() => {}} />);
    const field = screen.getByRole('textbox', { name: 'Search your workspace' });
    await user.type(field, 'quarterly forecast');
    await user.click(screen.getByRole('button', { name: 'Code' }));

    expect(field).toHaveValue('quarterly forecast');
    expect(screen.getByRole('button', { name: 'Code' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() =>
      expect(service.search).toHaveBeenLastCalledWith(
        'fixture-user',
        { query: 'quarterly forecast', category: 'code', limit: 50 },
        expect.anything(),
      ),
    );
  });

  it('returns to the page on Escape and hands focus back to the control that opened it', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" data-testid="search-entry" onClick={() => setOpen(true)}>
            Search
          </button>
          <GlobalSearchDialog
            open={open}
            onOpenChange={(next) => {
              onOpenChange(next);
              setOpen(next);
            }}
          />
        </>
      );
    }

    render(<Host />);
    const entry = screen.getByTestId('search-entry');
    await user.click(entry);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(entry));
  });

  it('offers the searches this account ran before, and running one searches for it', async () => {
    service.getRecentSearches.mockResolvedValue([
      { query: 'quarterly forecast', resultCount: 3, searchedAt: '2026-09-01T00:00:00.000Z' },
    ]);
    const user = userEvent.setup();

    render(<GlobalSearchDialog open onOpenChange={() => {}} />);

    const recent = await screen.findByRole('button', { name: /quarterly forecast/ });
    await user.click(recent);

    expect(screen.getByRole('textbox', { name: /search your workspace/i })).toHaveValue(
      'quarterly forecast',
    );
    await waitFor(() =>
      expect(service.search).toHaveBeenCalledWith(
        'fixture-user',
        expect.objectContaining({ query: 'quarterly forecast' }),
        expect.anything(),
      ),
    );
  });

  it('says the history is empty rather than showing an empty Recent Searches heading', async () => {
    render(<GlobalSearchDialog open onOpenChange={() => {}} />);

    expect(await screen.findByText('Start typing to search')).toBeInTheDocument();
    expect(screen.getByText('Your search history will appear here')).toBeInTheDocument();
    expect(screen.queryByText('Recent Searches')).not.toBeInTheDocument();
  });

  it('tells the searcher nothing matched instead of leaving the panel blank', async () => {
    const user = userEvent.setup();

    render(<GlobalSearchDialog open onOpenChange={() => {}} />);
    await user.type(
      screen.getByRole('textbox', { name: /search your workspace/i }),
      'nothing here matches',
    );

    expect(await screen.findByText('No results found')).toBeInTheDocument();
    expect(screen.getByText('Try different keywords or clear filters')).toBeInTheDocument();
  });

  it('says the search failed and retries it instead of reporting no results', async () => {
    service.search.mockRejectedValue(new Error('Search failed: offline'));
    const user = userEvent.setup();

    render(<GlobalSearchDialog open onOpenChange={() => {}} />);
    await user.type(screen.getByRole('textbox', { name: /search your workspace/i }), 'older chat');

    expect(await screen.findByText('Search could not be completed')).toBeInTheDocument();
    expect(screen.queryByText('No results found')).not.toBeInTheDocument();

    service.search.mockResolvedValue(EMPTY_RESULTS);
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('No results found')).toBeInTheDocument();
    expect(screen.queryByText('Search could not be completed')).not.toBeInTheDocument();
  });

  it('asks before clearing the search history, naming what cannot be undone', async () => {
    service.getRecentSearches.mockResolvedValue([
      { query: 'quarterly forecast', resultCount: 3, searchedAt: '2026-09-01T00:00:00.000Z' },
    ]);
    const user = userEvent.setup();

    render(<GlobalSearchDialog open onOpenChange={() => {}} />);
    await screen.findByText('Recent Searches');
    await user.click(screen.getByRole('button', { name: /^clear$/i }));

    expect(await screen.findByText('Clear search history?')).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(service.clearSearchHistory).not.toHaveBeenCalled();
  });
});
