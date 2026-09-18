import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HelpSearch } from '../components/HelpSearch';

/**
 * A live sweep only measures the states the corpus happens to produce. Empty,
 * unreachable and failed are covered here, where each one is deterministic.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('HelpSearch', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not search until the query is long enough to mean anything', async () => {
    const user = userEvent.setup();
    render(<HelpSearch />);

    await user.type(screen.getByLabelText('Search the help centre'), 'a');

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders each match as a link into the page that answers it', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        query: 'byok',
        corpus: 'available',
        results: [
          {
            docId: 'byok',
            title: 'Bring your own key',
            url: 'https://agiworkforce.com/byok',
            path: '/byok',
            category: 'product',
            snippet: 'Use your own provider key.',
          },
        ],
      }),
    );

    const user = userEvent.setup();
    render(<HelpSearch />);
    await user.type(screen.getByLabelText('Search the help centre'), 'byok');

    const link = await screen.findByRole('link', { name: 'Bring your own key' });
    expect(link).toHaveAttribute('href', '/byok');
    expect(await screen.findByText('1 page matches.')).toBeInTheDocument();
  });

  it('searches a query it was opened with, so a contextual link lands on the answer', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ query: 'permissions', corpus: 'available', results: [] }),
    );

    render(<HelpSearch initialQuery="permissions" />);

    expect(screen.getByLabelText('Search the help centre')).toHaveValue('permissions');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('q=permissions');
  });

  it('says nothing covers it, and where to go instead, rather than showing a blank panel', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ query: 'zzz', corpus: 'available', results: [] }));

    const user = userEvent.setup();
    render(<HelpSearch />);
    await user.type(screen.getByLabelText('Search the help centre'), 'zzz');

    expect(await screen.findByText(/Nothing here covers that yet/u)).toBeInTheDocument();
  });

  it('distinguishes an unloadable index from a query that matched nothing', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ query: 'billing', corpus: 'unavailable', results: [] }, 503),
    );

    const user = userEvent.setup();
    render(<HelpSearch />);
    await user.type(screen.getByLabelText('Search the help centre'), 'billing');

    expect(await screen.findByText(/Search is not answering right now/u)).toBeInTheDocument();
  });

  it('offers a way forward when the request itself fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    const user = userEvent.setup();
    render(<HelpSearch />);
    await user.type(screen.getByLabelText('Search the help centre'), 'billing');

    expect(await screen.findByText(/That search did not go through/u)).toBeInTheDocument();
  });

  it('announces every outcome in one polite live region', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ query: 'zzz', corpus: 'available', results: [] }));

    const user = userEvent.setup();
    render(<HelpSearch />);
    await user.type(screen.getByLabelText('Search the help centre'), 'zzz');

    await waitFor(() => {
      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
      expect(status.textContent).toMatch(/Nothing here covers that yet/u);
    });
  });
});
