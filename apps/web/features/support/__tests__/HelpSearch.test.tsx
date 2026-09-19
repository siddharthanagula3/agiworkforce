import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it.each(['', 'privacy'])(
    'discards pending results when the query changes to %j',
    async (query) => {
      let resolveBody!: (body: unknown) => void;
      const body = new Promise((resolve) => {
        resolveBody = resolve;
      });
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => body });
      render(<HelpSearch initialQuery="billing" />);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const signal = fetchMock.mock.calls[0]?.[1].signal as AbortSignal;
      fireEvent.change(screen.getByLabelText('Search the help centre'), {
        target: { value: query },
      });
      await act(async () => {
        resolveBody({
          results: [
            {
              docId: 'old',
              title: 'Old billing answer',
              path: '/pricing',
              category: 'billing',
              snippet: 'Old result',
            },
          ],
        });
        await body;
      });
      expect(screen.queryByRole('link', { name: 'Old billing answer' })).not.toBeInTheDocument();
      expect(signal.aborted).toBe(true);
    },
  );

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

  it('renders readable excerpt formatting without embedded links, images or HTML', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [
          {
            docId: 'credits',
            title: 'Credits',
            path: '/pricing',
            category: 'billing',
            snippet:
              '**Top-up purchase** uses `credits`. [Credit history](/billing) ![remote](https://example.invalid/image.png) <img src="https://example.invalid/raw.png">',
          },
        ],
      }),
    );
    const { container } = render(<HelpSearch initialQuery="credits" />);
    const emphasis = await screen.findByText('Top-up purchase');
    expect(emphasis.tagName).toBe('STRONG');
    expect(screen.getByText('credits').tagName).toBe('CODE');
    expect(container.textContent).not.toContain('**');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('p p')).toBeNull();
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
