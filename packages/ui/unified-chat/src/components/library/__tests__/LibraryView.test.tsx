/**
 * LibraryView.test.tsx, the shared Library surface.
 *
 * The view takes a LibraryTransport, which is the entire difference between
 * hosts: web supplies session cookies, a CSRF header, a project listing and an
 * upload path, desktop supplies a bearer-token fetch and none of the rest.
 * These tests drive the view through a stub transport, so they cover the
 * behaviour both hosts inherit and prove the optional host capabilities stay
 * absent rather than rendering dead controls.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LibraryView, type LibraryTransport } from '../LibraryView';

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

const FOLDER = {
  id: 'project-1',
  name: 'Runway model',
  updatedAt: '2026-08-02T00:00:00.000Z',
  itemCount: 4,
};

function pageOf(items: unknown[], hasMore = false, nextOffset: number | null = null) {
  return vi.fn(async () => jsonResponse({ items, has_more: hasMore, next_offset: nextOffset }));
}

function makeTransport(overrides: Partial<LibraryTransport> = {}): LibraryTransport {
  return {
    isSignedIn: true,
    listPage: pageOf([ITEM]),
    fetchAsset: vi.fn(async () => jsonResponse({})),
    deleteItem: vi.fn(async () => jsonResponse({ success: true })),
    permanentlyDeleteItem: vi.fn(async () => jsonResponse({ success: true })),
    restoreItem: vi.fn(async () => jsonResponse({ success: true })),
    openPreview: vi.fn(),
    ...overrides,
  };
}

function lastParams(transport: LibraryTransport): URLSearchParams {
  const calls = (transport.listPage as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1]![0] as URLSearchParams;
}

function openRowMenu(fileName: string) {
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${fileName}` }));
}

afterEach(() => {
  window.localStorage.clear();
});

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

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(transport.listPage).not.toHaveBeenCalled();
  });

  it('shows loading rather than an empty account while host auth is unresolved', async () => {
    const transport = makeTransport({ isAuthReady: false, isSignedIn: false });
    const view = render(<LibraryView transport={transport} />);

    expect(screen.getByTestId('library-loading')).toBeTruthy();
    expect(screen.queryByTestId('library-empty-state')).toBeNull();
    expect(transport.listPage).not.toHaveBeenCalled();

    const signedIn = makeTransport({ isAuthReady: true, isSignedIn: true });
    view.rerender(<LibraryView transport={signedIn} />);

    expect(await screen.findByText('quarterly-report.pdf')).toBeTruthy();
    expect(signedIn.listPage).toHaveBeenCalledTimes(1);
  });

  it('surfaces a load failure with a retry instead of an empty grid', async () => {
    const transport = makeTransport({ listPage: vi.fn(async () => jsonResponse({}, false)) });
    render(<LibraryView transport={transport} />);

    expect(await screen.findByTestId('library-error')).toBeTruthy();
    expect(screen.queryByTestId('library-empty-state')).toBeNull();
  });

  it('appends the next page rather than replacing it', async () => {
    const listPage = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [ITEM], has_more: true, next_offset: 24 }))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [{ ...ITEM, id: 'asset-2', file_name: 'data.csv' }],
          has_more: false,
          next_offset: null,
        }),
      );
    render(<LibraryView transport={makeTransport({ listPage })} />);

    fireEvent.click(await screen.findByTestId('library-show-more'));

    expect(await screen.findByText('data.csv')).toBeTruthy();
    expect(screen.getByText('quarterly-report.pdf')).toBeTruthy();
    expect((listPage.mock.calls[1]![0] as URLSearchParams).get('offset')).toBe('24');
  });

  describe('filter tabs', () => {
    it('asks the host for the active kinds instead of filtering the loaded page', async () => {
      const transport = makeTransport();
      render(<LibraryView transport={transport} />);
      await waitFor(() => expect(transport.listPage).toHaveBeenCalled());
      expect(lastParams(transport).get('kind')).toBeNull();

      fireEvent.click(screen.getByRole('tab', { name: 'Images' }));
      await waitFor(() => expect(lastParams(transport).get('kind')).toBe('image,video'));

      fireEvent.click(screen.getByRole('tab', { name: 'Documents' }));
      await waitFor(() => expect(lastParams(transport).get('kind')).toBe('file'));

      fireEvent.click(screen.getByRole('tab', { name: 'All' }));
      await waitFor(() => expect(lastParams(transport).get('kind')).toBeNull());
    });

    it('marks exactly one tab selected', async () => {
      render(<LibraryView transport={makeTransport()} />);
      await screen.findByText('quarterly-report.pdf');

      fireEvent.click(screen.getByRole('tab', { name: 'Images' }));
      expect(screen.getByRole('tab', { name: 'Images' }).getAttribute('aria-selected')).toBe(
        'true',
      );
      expect(screen.getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('false');
    });
  });

  describe('sort control', () => {
    it('sends the chosen sort to the host so it orders across pages', async () => {
      const transport = makeTransport();
      render(<LibraryView transport={transport} />);
      await waitFor(() => expect(transport.listPage).toHaveBeenCalled());
      expect(lastParams(transport).get('sort')).toBe('modified');

      fireEvent.click(screen.getByRole('button', { name: 'Sort by Modified' }));
      fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Size' }));

      await waitFor(() => expect(lastParams(transport).get('sort')).toBe('size'));
      expect(
        screen.getByRole('button', { name: 'Sort by Size' }).getAttribute('aria-expanded'),
      ).toBe('false');
    });

    it('closes the sort menu on Escape and returns focus to its trigger', async () => {
      render(<LibraryView transport={makeTransport()} />);
      await screen.findByText('quarterly-report.pdf');

      const trigger = screen.getByRole('button', { name: 'Sort by Modified' });
      fireEvent.click(trigger);
      await screen.findByRole('menu', { name: 'Sort the library' });

      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
      expect(document.activeElement).toBe(trigger);
    });
  });

  describe('grid and list views', () => {
    it('opens on the grid and remembers a switch to the list for the next mount', async () => {
      const first = render(<LibraryView transport={makeTransport()} />);
      await screen.findByTestId('library-grid');

      fireEvent.click(screen.getByRole('button', { name: 'List view' }));
      expect(screen.getByTestId('library-list')).toBeTruthy();
      expect(screen.queryByTestId('library-grid')).toBeNull();
      first.unmount();

      render(<LibraryView transport={makeTransport()} />);
      expect(await screen.findByTestId('library-list')).toBeTruthy();
    });

    it('gives the list the name, modified and size columns', async () => {
      render(<LibraryView transport={makeTransport()} />);
      await screen.findByTestId('library-grid');
      fireEvent.click(screen.getByRole('button', { name: 'List view' }));

      for (const column of ['Name', 'Modified', 'Size']) {
        expect(screen.getByRole('columnheader', { name: column })).toBeTruthy();
      }
      expect(screen.getByText('2 KB')).toBeTruthy();
    });

    it('shows a thumbnail in the grid only when the host exposes an inline URI', async () => {
      const image = { ...ITEM, file_name: 'chart.png', mime_type: 'image/png', previewable: true };
      const withoutUri = makeTransport({ listPage: pageOf([image]) });
      const first = render(<LibraryView transport={withoutUri} />);

      await screen.findByText('chart.png');
      expect(screen.queryByTestId('library-thumbnail')).toBeNull();
      first.unmount();

      const inlinePreviewUri = vi.fn((uri: string) => uri);
      render(
        <LibraryView transport={makeTransport({ listPage: pageOf([image]), inlinePreviewUri })} />,
      );

      expect((await screen.findByTestId('library-thumbnail')).getAttribute('src')).toBe(
        '/api/files/asset-1',
      );
      expect(inlinePreviewUri).toHaveBeenCalledWith('/api/files/asset-1');
    });

    it('carries no provenance chip and no readiness badge on the face', async () => {
      render(
        <LibraryView
          transport={makeTransport({
            listPage: pageOf([{ ...ITEM, provider: 'someprovider', model: 'somemodel' }]),
          })}
        />,
      );

      await screen.findByText('quarterly-report.pdf');
      for (const noise of [/managed/i, /ready/i, /gateway/i]) {
        expect(screen.queryByText(noise)).toBeNull();
      }
    });

    it('reports vanished bytes and drops the open gesture after an authenticated 404', async () => {
      const image = {
        ...ITEM,
        file_name: 'missing.png',
        mime_type: 'image/png',
        previewable: true,
      };
      const fetchAsset = vi.fn(async () => ({ status: 404, ok: false }) as Response);
      render(
        <LibraryView
          transport={makeTransport({
            fetchAsset,
            inlinePreviewUri: (uri) => uri,
            listPage: pageOf([image]),
          })}
        />,
      );

      fireEvent.error(await screen.findByTestId('library-thumbnail'));

      await waitFor(() => expect(fetchAsset).toHaveBeenCalledWith('/api/files/asset-1'));
      expect(await screen.findByText(/stored bytes are gone/i)).toBeTruthy();
      expect(screen.queryByTestId('library-thumbnail')).toBeNull();
    });
  });

  describe('row menu and confirmation', () => {
    it('keeps Delete behind the row menu and behind a confirm that names the consequence', async () => {
      const transport = makeTransport();
      render(<LibraryView transport={transport} />);
      await screen.findByText('quarterly-report.pdf');

      expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();
      openRowMenu('quarterly-report.pdf');

      fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
      expect(screen.getByText(/restorable for 30 days/i)).toBeTruthy();
      expect(transport.deleteItem).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(transport.deleteItem).toHaveBeenCalledWith('asset-1'));
      await waitFor(() => expect(screen.queryByText('quarterly-report.pdf')).toBeNull());
    });

    it('downloads from the row menu through the host authed fetch', async () => {
      const transport = makeTransport();
      render(<LibraryView transport={transport} />);
      await screen.findByText('quarterly-report.pdf');

      openRowMenu('quarterly-report.pdf');
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Download' }));

      await waitFor(() => expect(transport.fetchAsset).toHaveBeenCalledWith('/api/files/asset-1'));
    });

    it('closes the row menu on Escape and returns focus to its trigger', async () => {
      render(<LibraryView transport={makeTransport()} />);
      await screen.findByText('quarterly-report.pdf');

      const trigger = screen.getByRole('button', { name: 'Actions for quarterly-report.pdf' });
      fireEvent.click(trigger);
      await screen.findByRole('menu', { name: 'Actions for quarterly-report.pdf' });

      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
      expect(document.activeElement).toBe(trigger);
    });

    it('names permanent erasure as unrecoverable before erasing a deleted item', async () => {
      const transport = makeTransport();
      render(<LibraryView transport={transport} />);
      await screen.findByText('quarterly-report.pdf');

      fireEvent.click(screen.getByRole('button', { name: 'Recently deleted' }));
      await waitFor(() => expect(lastParams(transport).get('deleted')).toBe('true'));

      openRowMenu('quarterly-report.pdf');
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete permanently' }));
      expect(screen.getByText(/Nothing restores this file/i)).toBeTruthy();
      expect(transport.permanentlyDeleteItem).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
      await waitFor(() => expect(transport.permanentlyDeleteItem).toHaveBeenCalledWith('asset-1'));
    });

    it('offers Restore rather than Download while viewing Recently deleted', async () => {
      const transport = makeTransport();
      render(<LibraryView transport={transport} />);
      await screen.findByText('quarterly-report.pdf');

      fireEvent.click(screen.getByRole('button', { name: 'Recently deleted' }));
      await waitFor(() => expect(lastParams(transport).get('deleted')).toBe('true'));

      openRowMenu('quarterly-report.pdf');
      expect(await screen.findByRole('menuitem', { name: 'Restore' })).toBeTruthy();
      expect(screen.queryByRole('menuitem', { name: 'Download' })).toBeNull();

      fireEvent.click(screen.getByRole('menuitem', { name: 'Restore' }));
      await waitFor(() => expect(transport.restoreItem).toHaveBeenCalledWith('asset-1'));
    });
  });

  describe('folders', () => {
    it('lists host folders alongside files and opens the one that is clicked', async () => {
      const openFolder = vi.fn();
      render(
        <LibraryView
          transport={makeTransport({ listFolders: async () => [FOLDER], openFolder })}
        />,
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Open Runway model' }));
      expect(openFolder).toHaveBeenCalledWith(FOLDER);
      expect(screen.getByTestId('library-folder-tile')).toBeTruthy();
      expect(screen.getByText('quarterly-report.pdf')).toBeTruthy();
    });

    it('renders a folder row in the list view too', async () => {
      const openFolder = vi.fn();
      render(
        <LibraryView
          transport={makeTransport({ listFolders: async () => [FOLDER], openFolder })}
        />,
      );
      await screen.findByTestId('library-folder-tile');
      fireEvent.click(screen.getByRole('button', { name: 'List view' }));

      const row = screen.getByTestId('library-folder-row');
      fireEvent.keyDown(row, { key: 'Enter' });
      expect(openFolder).toHaveBeenCalledWith(FOLDER);
    });

    it('renders no folder affordance for a host that lists none', async () => {
      render(<LibraryView transport={makeTransport()} />);
      await screen.findByText('quarterly-report.pdf');

      expect(screen.queryByTestId('library-folder-tile')).toBeNull();
      expect(screen.queryByRole('button', { name: /New/ })).toBeNull();
    });

    it('hides folders under a type tab, where a folder is neither kind', async () => {
      render(<LibraryView transport={makeTransport({ listFolders: async () => [FOLDER] })} />);
      await screen.findByTestId('library-folder-tile');

      fireEvent.click(screen.getByRole('tab', { name: 'Documents' }));
      await waitFor(() => expect(screen.queryByTestId('library-folder-tile')).toBeNull());
    });
  });

  describe('the New menu', () => {
    it('hands picked files to the host uploader and reloads the first page', async () => {
      const uploadFiles = vi.fn(async () => {});
      const transport = makeTransport({ uploadFiles });
      render(<LibraryView transport={transport} />);
      await screen.findByText('quarterly-report.pdf');

      fireEvent.click(screen.getByRole('button', { name: /New/ }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Upload file' }));

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      await waitFor(() => expect(uploadFiles).toHaveBeenCalledWith([file]));
      await waitFor(() => expect(transport.listPage).toHaveBeenCalledTimes(2));
    });

    it('offers New project only when the host can create one', async () => {
      const withCreate = makeTransport({ uploadFiles: async () => {}, createFolder: vi.fn() });
      const first = render(<LibraryView transport={withCreate} />);
      await screen.findByText('quarterly-report.pdf');
      fireEvent.click(screen.getByRole('button', { name: /New/ }));
      expect(await screen.findByRole('menuitem', { name: 'New project' })).toBeTruthy();
      first.unmount();

      render(<LibraryView transport={makeTransport({ uploadFiles: async () => {} })} />);
      await screen.findByText('quarterly-report.pdf');
      fireEvent.click(screen.getByRole('button', { name: /New/ }));
      expect(await screen.findByRole('menuitem', { name: 'Upload file' })).toBeTruthy();
      expect(screen.queryByRole('menuitem', { name: 'New project' })).toBeNull();
    });

    it('reports a failed upload rather than a silently unchanged list', async () => {
      const uploadFiles = vi.fn(async () => {
        throw new Error('Object storage is not configured');
      });
      render(<LibraryView transport={makeTransport({ uploadFiles })} />);
      await screen.findByText('quarterly-report.pdf');

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', {
        value: [new File(['x'], 'notes.txt', { type: 'text/plain' })],
      });
      fireEvent.change(input);

      expect(await screen.findByRole('alert')).toBeTruthy();
    });
  });

  describe('empty states', () => {
    it('offers an upload from an empty library that a host can upload to', async () => {
      render(
        <LibraryView
          transport={makeTransport({ listPage: pageOf([]), uploadFiles: async () => {} })}
        />,
      );

      await screen.findByTestId('library-empty-state');
      expect(screen.getByText('Your library is empty')).toBeTruthy();
      expect(screen.getByRole('button', { name: /Upload a file/ })).toBeTruthy();
    });

    it('explains retention when Recently deleted is empty and offers no upload there', async () => {
      render(
        <LibraryView
          transport={makeTransport({ listPage: pageOf([]), uploadFiles: async () => {} })}
        />,
      );
      await screen.findByTestId('library-empty-state');

      fireEvent.click(screen.getByRole('button', { name: 'Recently deleted' }));

      expect(await screen.findByText('Recently deleted is empty')).toBeTruthy();
      expect(screen.getByText(/30 days/i)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Upload a file/ })).toBeNull();
    });

    it('separates a search miss from an empty account', async () => {
      const transport = makeTransport({ listPage: pageOf([]) });
      render(<LibraryView transport={transport} initialQuery="nothingmatches" />);

      expect(await screen.findByText('No matches')).toBeTruthy();
      await waitFor(() => expect(lastParams(transport).get('q')).toBe('nothingmatches'));
    });
  });

  describe('artifact-class rows', () => {
    const ARTIFACT_ITEM = {
      ...ITEM,
      id: 'asset-artifact',
      file_name: 'dashboard.html',
      mime_type: 'text/html',
      surface: 'artifact',
      previewable: true,
    };

    function artifactTransport(content: string, overrides: Partial<LibraryTransport> = {}) {
      return makeTransport({
        listPage: pageOf([ARTIFACT_ITEM]),
        fetchAsset: vi.fn(
          async () => ({ ok: true, status: 200, text: async () => content }) as Response,
        ),
        ...overrides,
      });
    }

    it('renders an artifact row through the sandboxed renderer, not the host raw-bytes tab', async () => {
      const transport = artifactTransport('<p>hi</p>');
      render(<LibraryView transport={transport} />);

      fireEvent.click(await screen.findByRole('button', { name: 'Open dashboard.html' }));

      expect(await screen.findByTestId('artifact-renderer')).toBeTruthy();
      expect(transport.openPreview).not.toHaveBeenCalled();
    });

    it('keeps a non-artifact row on the host preview gesture', async () => {
      const transport = makeTransport({ listPage: pageOf([{ ...ITEM, previewable: true }]) });
      render(<LibraryView transport={transport} />);

      fireEvent.click(await screen.findByRole('button', { name: 'Open quarterly-report.pdf' }));

      expect(transport.openPreview).toHaveBeenCalledWith('/api/files/asset-1');
    });

    it('reports an artifact that cannot be read instead of an empty viewer', async () => {
      const transport = makeTransport({
        listPage: pageOf([ARTIFACT_ITEM]),
        fetchAsset: vi.fn(async () => ({ ok: false, status: 500 }) as Response),
      });
      render(<LibraryView transport={transport} />);

      fireEvent.click(await screen.findByRole('button', { name: 'Open dashboard.html' }));

      expect(await screen.findByTestId('library-artifact-error-asset-artifact')).toBeTruthy();
    });

    it('refuses to inline an artifact large enough to hang the tab', async () => {
      render(<LibraryView transport={artifactTransport('x'.repeat(512 * 1024 + 1))} />);

      fireEvent.click(await screen.findByRole('button', { name: 'Open dashboard.html' }));

      expect(await screen.findByText(/too large to preview here/i)).toBeTruthy();
      expect(screen.queryByTestId('artifact-renderer')).toBeNull();
    });

    it('invokes the host native export handler with the real fetched content', async () => {
      const exportNative = vi.fn(async () => {});
      const markdown = {
        ...ARTIFACT_ITEM,
        id: 'asset-markdown',
        file_name: 'summary.md',
        mime_type: 'text/markdown',
      };
      render(
        <LibraryView
          transport={makeTransport({
            listPage: pageOf([markdown]),
            fetchAsset: vi.fn(
              async () => ({ ok: true, status: 200, text: async () => '# Revenue' }) as Response,
            ),
            exportNative,
            nativeExportFormats: ['pdf'] as const,
          })}
        />,
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Open summary.md' }));
      await screen.findByTestId('artifact-renderer');
      fireEvent.click(screen.getByRole('button', { name: 'Download or export artifact' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Export as PDF' }));

      await waitFor(() =>
        expect(exportNative).toHaveBeenCalledWith(
          'pdf',
          'asset-markdown',
          '# Revenue',
          'summary.md',
        ),
      );
    });

    it('offers no native export option when the host declares none', async () => {
      render(<LibraryView transport={artifactTransport('<p>x</p>')} />);

      fireEvent.click(await screen.findByRole('button', { name: 'Open dashboard.html' }));
      await screen.findByTestId('artifact-renderer');
      fireEvent.click(screen.getByRole('button', { name: 'Download or export artifact' }));

      expect(screen.queryByRole('button', { name: /^Export as/ })).toBeNull();
    });
  });
});
