import { useState } from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const service = vi.hoisted(() => ({
  search: vi.fn(),
  getRecentSearches: vi.fn(),
  getPopularSearches: vi.fn(),
  clearSearchHistory: vi.fn(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@shared/stores/authentication-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/stores/authentication-store')>()),
  useAuthStore: () => ({ user: { id: 'fixture-user' } }),
}));
vi.mock('../../../services/global-search-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/global-search-service')>()),
  globalSearchService: service,
}));

import { GlobalSearchDialog } from '../GlobalSearchDialog';

const EMPTY_RESULTS = {
  results: [],
  stats: { totalResults: 0, searchTime: 4, conversationCount: 0, messageCount: 0 },
};

beforeEach(() => {
  service.search.mockReset().mockResolvedValue(EMPTY_RESULTS);
  service.getRecentSearches.mockReset().mockResolvedValue([]);
  service.getPopularSearches.mockReset().mockResolvedValue([]);
  service.clearSearchHistory.mockReset().mockResolvedValue(0);
});
afterEach(cleanup);

describe('GlobalSearchDialog', () => {
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

    expect(screen.getByRole('textbox', { name: /search messages and conversations/i })).toHaveValue(
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
      screen.getByRole('textbox', { name: /search messages and conversations/i }),
      'nothing here matches',
    );

    expect(await screen.findByText('No results found')).toBeInTheDocument();
    expect(screen.getByText('Try different keywords or clear filters')).toBeInTheDocument();
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
