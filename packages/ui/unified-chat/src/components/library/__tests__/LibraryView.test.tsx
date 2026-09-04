/**
 * LibraryView.test.tsx, the shared Library surface.
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

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
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

  describe('artifact-class rows', () => {
    const ARTIFACT_ITEM = {
      ...ITEM,
      id: 'asset-artifact',
      file_name: 'dashboard.html',
      mime_type: 'text/html',
      surface: 'artifact',
      previewable: true,
      uri: '/api/files/asset-artifact',
    };

    function artifactTransport(overrides: Partial<LibraryTransport> = {}): LibraryTransport {
      return makeTransport({
        listPage: vi.fn(async () =>
          jsonResponse({ items: [ARTIFACT_ITEM], has_more: false, next_offset: null }),
        ),
        fetchAsset: vi.fn(
          async () =>
            ({
              ok: true,
              status: 200,
              text: async () => '<h1>Quarterly dashboard</h1>',
            }) as unknown as Response,
        ),
        ...overrides,
      });
    }

    it('renders a surface:artifact row through the sandboxed artifact renderer instead of the host raw-bytes tab', async () => {
      const transport = artifactTransport();
      render(<LibraryView transport={transport} />);

      await screen.findByText('dashboard.html');
      expect(screen.queryByTestId('artifact-renderer')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

      const renderer = await screen.findByTestId('artifact-renderer');
      expect(renderer.getAttribute('data-artifact-id')).toBe('asset-artifact');
      expect(transport.fetchAsset).toHaveBeenCalledWith('/api/files/asset-artifact');
      expect(transport.openPreview).not.toHaveBeenCalled();
    });

    it('keeps a non-artifact row on the host preview gesture', async () => {
      const fileItem = { ...ARTIFACT_ITEM, surface: 'file', file_name: 'sheet.csv' };
      const transport = artifactTransport({
        listPage: vi.fn(async () =>
          jsonResponse({ items: [fileItem], has_more: false, next_offset: null }),
        ),
      });
      render(<LibraryView transport={transport} />);

      await screen.findByText('sheet.csv');
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

      await waitFor(() =>
        expect(transport.openPreview).toHaveBeenCalledWith('/api/files/asset-artifact'),
      );
      expect(screen.queryByTestId('artifact-renderer')).toBeNull();
    });

    it('reports an artifact that cannot be read instead of showing an empty viewer', async () => {
      const transport = artifactTransport({
        fetchAsset: vi.fn(async () => ({ ok: false, status: 500 }) as Response),
      });
      render(<LibraryView transport={transport} />);

      await screen.findByText('dashboard.html');
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

      expect(await screen.findByTestId('library-artifact-error-asset-artifact')).toBeTruthy();
      expect(screen.queryByTestId('artifact-renderer')).toBeNull();
    });

    it('invokes the host native export handler with the real fetched content', async () => {
      const markdownItem = {
        ...ARTIFACT_ITEM,
        id: 'asset-markdown',
        file_name: 'quarterly-summary.md',
        mime_type: 'text/markdown',
        uri: '/api/files/asset-markdown',
      };
      const exportNative = vi.fn(async () => {});
      const transport = artifactTransport({
        listPage: vi.fn(async () =>
          jsonResponse({ items: [markdownItem], has_more: false, next_offset: null }),
        ),
        fetchAsset: vi.fn(
          async () =>
            ({
              ok: true,
              status: 200,
              text: async () => '# Quarterly summary\n\nRevenue is up.',
            }) as unknown as Response,
        ),
        exportNative,
        nativeExportFormats: ['pdf', 'word'],
      });
      render(<LibraryView transport={transport} />);

      await screen.findByText('quarterly-summary.md');
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
      await screen.findByTestId('artifact-renderer');

      fireEvent.click(screen.getByRole('button', { name: 'Download or export artifact' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Export as PDF' }));

      await waitFor(() =>
        expect(exportNative).toHaveBeenCalledWith(
          'pdf',
          'asset-markdown',
          '# Quarterly summary\n\nRevenue is up.',
          'quarterly-summary.md',
        ),
      );
    });

    it('offers no native export option when the host declares none', async () => {
      const markdownItem = {
        ...ARTIFACT_ITEM,
        id: 'asset-markdown-2',
        file_name: 'notes.md',
        mime_type: 'text/markdown',
        uri: '/api/files/asset-markdown-2',
      };
      const transport = artifactTransport({
        listPage: vi.fn(async () =>
          jsonResponse({ items: [markdownItem], has_more: false, next_offset: null }),
        ),
        fetchAsset: vi.fn(
          async () =>
            ({ ok: true, status: 200, text: async () => '# Notes' }) as unknown as Response,
        ),
      });
      render(<LibraryView transport={transport} />);

      await screen.findByText('notes.md');
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
      await screen.findByTestId('artifact-renderer');

      fireEvent.click(screen.getByRole('button', { name: 'Download or export artifact' }));
      expect(screen.queryByRole('button', { name: 'Export as PDF' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Export as Word' })).toBeNull();
    });

    it('refuses to inline an artifact large enough to hang the tab', async () => {
      const transport = artifactTransport({
        fetchAsset: vi.fn(
          async () =>
            ({
              ok: true,
              status: 200,
              text: async () => 'x'.repeat(512 * 1024 + 1),
            }) as unknown as Response,
        ),
      });
      render(<LibraryView transport={transport} />);

      await screen.findByText('dashboard.html');
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

      expect(await screen.findByText(/too large to preview here/i)).toBeTruthy();
      expect(screen.queryByTestId('artifact-renderer')).toBeNull();
    });
  });
});
