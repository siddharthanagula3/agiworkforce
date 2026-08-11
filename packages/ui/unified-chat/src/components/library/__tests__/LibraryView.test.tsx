/**
 * LibraryView.test.tsx — the shared Library surface.
 *
 * The view was web-only, so Desktop had no Library at all. It now takes a
 * LibraryTransport, which is the entire difference between hosts: web supplies
 * Clerk session cookies and a CSRF header, desktop supplies a bearer-token
 * fetch. These tests drive the view through a stub transport, so they cover the
 * behaviour both hosts inherit.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LibraryView, type LibraryTransport } from '../LibraryView';

// Root CI executes many package suites concurrently. This mount-effect test is
// fast when focused, but its jsdom worker can be scheduler-starved beyond the
// 5 s default. Keep the extra budget on this test rather than the whole suite.
const ROOT_GRAPH_TEST_TIMEOUT_MS = 15_000;
const ACTIVE_FILTERS_TEST = 'passes the active filters to the host rather than filtering locally';

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
    blob: async () => new Blob(['x']),
  } as unknown as Response;
}

// Shaped to LibraryItemSchema — the view parses through the shared contract,
// so a partial row is silently dropped rather than rendered.
const ITEM = {
  id: 'asset-1',
  file_name: 'quarterly-report.pdf',
  mime_type: 'application/pdf',
  kind: 'file',
  byte_count: 2048,
  uri: '/api/files/asset-1',
  surface: 'file',
  previewable: false,
  origin: 'generated',
  source_surface: 'web',
  provider: null,
  model: null,
  prompt: null,
  created_at: '2026-07-01T00:00:00.000Z',
};

function makeTransport(overrides: Partial<LibraryTransport> = {}): LibraryTransport {
  return {
    isSignedIn: true,
    listPage: vi.fn(async () =>
      jsonResponse({ items: [ITEM], has_more: false, next_offset: null }),
    ),
    fetchAsset: vi.fn(async () => jsonResponse({})),
    deleteItem: vi.fn(async () => jsonResponse({ success: true })),
    permanentlyDeleteItem: vi.fn(async () => jsonResponse({ success: true })),
    restoreItem: vi.fn(async () => jsonResponse({ success: true })),
    openPreview: vi.fn(),
    ...overrides,
  };
}

describe('shared LibraryView', () => {
  it('renders items supplied by the host transport', async () => {
    const transport = makeTransport();
    render(<LibraryView transport={transport} />);

    expect(await screen.findByText('quarterly-report.pdf')).toBeTruthy();
    expect(transport.listPage).toHaveBeenCalled();
  });

  it('never fetches when the host reports a signed-out session', async () => {
    const transport = makeTransport({ isSignedIn: false });
    render(<LibraryView transport={transport} />);

    // An authenticated request from a signed-out surface is the bug this guards.
    await new Promise((r) => setTimeout(r, 50));
    expect(transport.listPage).not.toHaveBeenCalled();
  });

  it('shows loading rather than an empty account while host auth is unresolved', async () => {
    const transport = makeTransport({ isAuthReady: false, isSignedIn: false });
    const view = render(<LibraryView transport={transport} />);

    expect(screen.getByTestId('library-loading')).toBeTruthy();
    expect(screen.queryByTestId('library-empty-state')).toBeNull();
    expect(transport.listPage).not.toHaveBeenCalled();

    const signedInTransport = makeTransport({ isAuthReady: true, isSignedIn: true });
    view.rerender(<LibraryView transport={signedInTransport} />);

    expect(await screen.findByText('quarterly-report.pdf')).toBeTruthy();
    expect(signedInTransport.listPage).toHaveBeenCalledTimes(1);
  });

  it(
    ACTIVE_FILTERS_TEST,
    async () => {
      const transport = makeTransport();
      render(<LibraryView transport={transport} />);

      await waitFor(() => expect(transport.listPage).toHaveBeenCalled());
      const params = (transport.listPage as ReturnType<typeof vi.fn>).mock
        .calls[0]![0] as URLSearchParams;
      expect(params.get('limit')).toBeTruthy();
    },
    ROOT_GRAPH_TEST_TIMEOUT_MS,
  );

  it('surfaces a load failure with a retry instead of an empty grid', async () => {
    const transport = makeTransport({ listPage: vi.fn(async () => jsonResponse({}, false)) });
    render(<LibraryView transport={transport} />);

    // An empty state here would say "nothing here yet", which is a different
    // and wrong statement from "we could not load it".
    expect(await screen.findByTestId('library-error')).toBeTruthy();
    expect(screen.queryByTestId('library-empty-state')).toBeNull();
  });

  it('shows an honest empty state when the host returns nothing', async () => {
    const transport = makeTransport({
      listPage: vi.fn(async () => jsonResponse({ items: [], has_more: false, next_offset: null })),
    });
    render(<LibraryView transport={transport} />);

    expect(await screen.findByTestId('library-empty-state')).toBeTruthy();
  });

  it('explains retention and recovery when Recently deleted is empty', async () => {
    const transport = makeTransport({
      listPage: vi.fn(async () => jsonResponse({ items: [], has_more: false, next_offset: null })),
      startChat: vi.fn(),
    });
    render(<LibraryView transport={transport} />);

    await screen.findByTestId('library-empty-state');
    fireEvent.click(screen.getByRole('button', { name: 'Recently deleted' }));

    expect(await screen.findByText('Recently deleted is empty')).toBeTruthy();
    expect(screen.getByText(/stay here for 30 days/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start a chat' })).toBeNull();
  });

  it('confirms a recoverable delete before moving an item out of the live grid', async () => {
    const transport = makeTransport();
    render(<LibraryView transport={transport} />);

    await screen.findByText('quarterly-report.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Delete quarterly-report.pdf' }));

    expect(screen.getByText(/restore it for 30 days/i)).toBeTruthy();
    expect(transport.deleteItem).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Move to Recently deleted' }));
    await waitFor(() => expect(transport.deleteItem).toHaveBeenCalledWith('asset-1'));
    await waitFor(() => expect(screen.queryByText('quarterly-report.pdf')).toBeNull());
  });

  it('requires a second confirmation before permanently erasing a deleted item', async () => {
    const transport = makeTransport();
    render(<LibraryView transport={transport} />);

    await screen.findByText('quarterly-report.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Recently deleted' }));
    await waitFor(() => {
      const calls = (transport.listPage as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[calls.length - 1]?.[0].get('deleted')).toBe('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(screen.getByText(/cannot be restored/i)).toBeTruthy();
    expect(transport.permanentlyDeleteItem).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently', hidden: false }));
    await waitFor(() => expect(transport.permanentlyDeleteItem).toHaveBeenCalledWith('asset-1'));
    await waitFor(() => expect(screen.queryByText('quarterly-report.pdf')).toBeNull());
  });

  it('only exposes a protected image URI to the renderer when the host explicitly opts in', async () => {
    const imageItem = {
      ...ITEM,
      file_name: 'chart.png',
      mime_type: 'image/png',
      previewable: true,
    };
    const withoutDirectUri = makeTransport({
      listPage: vi.fn(async () =>
        jsonResponse({ items: [imageItem], has_more: false, next_offset: null }),
      ),
    });
    const first = render(<LibraryView transport={withoutDirectUri} />);

    await screen.findByText('chart.png');
    expect(screen.queryByAltText('chart.png preview')).toBeNull();
    first.unmount();

    const inlinePreviewUri = vi.fn((uri: string) => uri);
    const withDirectUri = makeTransport({
      inlinePreviewUri,
      listPage: vi.fn(async () =>
        jsonResponse({ items: [imageItem], has_more: false, next_offset: null }),
      ),
    });
    render(<LibraryView transport={withDirectUri} />);

    expect((await screen.findByAltText('chart.png preview')).getAttribute('src')).toBe(
      '/api/files/asset-1',
    );
    expect(inlinePreviewUri).toHaveBeenCalledWith('/api/files/asset-1');
  });

  it('replaces a broken thumbnail and disables stale actions after an authenticated 404', async () => {
    const imageItem = {
      ...ITEM,
      file_name: 'missing-image.png',
      mime_type: 'image/png',
      previewable: true,
    };
    const fetchAsset = vi.fn(async () => ({ status: 404, ok: false }) as Response);
    const transport = makeTransport({
      fetchAsset,
      inlinePreviewUri: (uri) => uri,
      listPage: vi.fn(async () =>
        jsonResponse({ items: [imageItem], has_more: false, next_offset: null }),
      ),
    });
    render(<LibraryView transport={transport} />);

    fireEvent.error(await screen.findByAltText('missing-image.png preview'));

    await waitFor(() => expect(fetchAsset).toHaveBeenCalledWith('/api/files/asset-1'));
    expect(await screen.findByText(/stored file bytes are no longer available/i)).toBeTruthy();
    expect(screen.queryByAltText('missing-image.png preview')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download generated file' })).toBeNull();
    expect(screen.getByText('Failed')).toBeTruthy();
  });
});
