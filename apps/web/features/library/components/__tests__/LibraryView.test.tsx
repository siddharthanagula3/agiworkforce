import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

const { mockUseAuth, exportDocument, uploadChatAttachments, push } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(() => ({ isSignedIn: true })),
  exportDocument: vi.fn(async () => {}),
  uploadChatAttachments: vi.fn(async () => []),
  push: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mocked at the module boundary LibraryView actually imports through
// (@features/chat/services/document-export-service is the real, shared
// export service used elsewhere in chat, this proves LibraryView calls it,
// not a second exporter, without exercising jsPDF/docx internals here).
vi.mock('@features/chat/services/document-export-service', () => ({ exportDocument }));

// The same boundary for uploads: the Library's New menu must reach the one
// upload path that catalogs an asset, not a second uploader of its own.
vi.mock('@features/chat/services/chat-attachment-upload', () => ({ uploadChatAttachments }));

import { LibraryView, iconKindFor, generatedFileFromLibraryItem } from '../LibraryView';

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    file_name: 'report.pdf',
    mime_type: 'application/pdf',
    kind: 'file',
    byte_count: 2048,
    uri: '/api/files/22222222-2222-4222-8222-222222222222',
    surface: 'file',
    previewable: true,
    origin: 'generated',
    source_surface: 'web',
    provider: 'anthropic',
    model: 'model-x',
    prompt: null,
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function pageResponse(items: unknown[], hasMore = false, nextOffset: number | null = null) {
  return {
    ok: true,
    json: async () => ({ items, has_more: hasMore, next_offset: nextOffset }),
  } as Response;
}

function projectsResponse(projects: unknown[]) {
  return { ok: true, json: async () => ({ projects }) } as Response;
}

const PROJECT = {
  id: 'proj_abc123',
  name: 'Runway model',
  updatedAt: '2026-08-02T00:00:00.000Z',
  conversationCount: 3,
};

const fetchMock = vi.fn();

function routeFetch(items: unknown[], projects: unknown[] = []) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/projects')) return projectsResponse(projects);
    return pageResponse(items);
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  routeFetch([makeItem()]);
  mockUseAuth.mockReturnValue({ isSignedIn: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  push.mockReset();
  uploadChatAttachments.mockClear();
  window.localStorage.clear();
});

function libraryCalls() {
  return fetchMock.mock.calls
    .map((call) => String(call[0]))
    .filter((url) => url.includes('/api/library'));
}

describe('LibraryView', () => {
  it('never fetches while signed out', async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false });
    render(<LibraryView />);
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders the fetched page as a grid of library tiles', async () => {
    render(<LibraryView />);
    await waitFor(() => expect(screen.getByTestId('library-grid')).toBeInTheDocument());
    expect(screen.getAllByTestId('library-tile')).toHaveLength(1);
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    const url = libraryCalls()[0] ?? '';
    expect(url).toContain('/api/library?');
    expect(url).toContain('sort=modified');
    expect(url).not.toContain('kind=');
  });

  it('drops provenance chips and the readiness badge from the tile face', async () => {
    render(<LibraryView />);
    await screen.findByText('report.pdf');
    for (const noise of [/managed/i, /ready/i, /gateway/i]) {
      expect(screen.queryByText(noise)).toBeNull();
    }
  });

  it('re-fetches with the tab kinds and the chosen sort', async () => {
    render(<LibraryView />);
    await waitFor(() => expect(libraryCalls().length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('tab', { name: 'Images' }));
    await waitFor(() => expect(libraryCalls().at(-1)).toContain('kind=image%2Cvideo'));

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Modified' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Name' }));
    await waitFor(() => expect(libraryCalls().at(-1)).toContain('sort=name'));
  });

  it('sends the debounced search query as q', async () => {
    render(<LibraryView />);
    await waitFor(() => expect(libraryCalls().length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText('Search the library by name'), {
      target: { value: 'quarterly' },
    });
    await waitFor(() => expect(libraryCalls().at(-1)).toContain('q=quarterly'));
  });

  it('switches to the list view with name, modified and size columns', async () => {
    render(<LibraryView />);
    await screen.findByTestId('library-grid');
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));

    expect(screen.getByTestId('library-list')).toBeInTheDocument();
    for (const column of ['Name', 'Modified', 'Size']) {
      expect(screen.getByRole('columnheader', { name: column })).toBeInTheDocument();
    }
  });

  it('lists the account projects as folders and opens the project page', async () => {
    routeFetch([makeItem()], [PROJECT]);
    render(<LibraryView />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open Runway model' }));
    expect(push).toHaveBeenCalledWith('/chat/projects/proj_abc123');
  });

  it('uploads through the cataloging attachment service and reloads the page', async () => {
    render(<LibraryView />);
    await screen.findByText('report.pdf');
    const before = libraryCalls().length;

    fireEvent.click(screen.getByRole('button', { name: /New/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Upload file' }));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    await waitFor(() => expect(uploadChatAttachments).toHaveBeenCalledWith([file]));
    await waitFor(() => expect(libraryCalls().length).toBeGreaterThan(before));
  });

  it('keeps Delete behind the row menu and a confirm', async () => {
    render(<LibraryView />);
    await screen.findByText('report.pdf');

    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for report.pdf' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(screen.getByText(/restorable for 30 days/i)).toBeInTheDocument();
    const deleteCalls = fetchMock.mock.calls.filter((call) => call[1]?.method === 'DELETE');
    expect(deleteCalls).toHaveLength(0);
  });

  it('shows the honest empty state with an upload action', async () => {
    routeFetch([]);
    render(<LibraryView />);
    await waitFor(() => expect(screen.getByTestId('library-empty-state')).toBeInTheDocument());
    expect(screen.getByText('Your library is empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload a file/ })).toBeInTheDocument();
  });

  it('surfaces load failures with a Retry that re-fetches', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/projects')) return projectsResponse([]);
      return { ok: false, status: 500 } as Response;
    });
    render(<LibraryView />);
    await waitFor(() => expect(screen.getByTestId('library-error')).toBeInTheDocument());

    routeFetch([makeItem()]);
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    await waitFor(() => expect(screen.getByTestId('library-grid')).toBeInTheDocument());
    expect(screen.queryByTestId('library-error')).not.toBeInTheDocument();
  });

  it('appends the next page via Show more', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/projects')) return projectsResponse([]);
      if (url.includes('offset=24')) {
        return pageResponse([
          makeItem({ id: '33333333-3333-4333-8333-333333333333', file_name: 'data.csv' }),
        ]);
      }
      return pageResponse([makeItem()], true, 24);
    });
    render(<LibraryView />);
    await waitFor(() => expect(screen.getByTestId('library-show-more')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('library-show-more'));
    await waitFor(() => expect(screen.getAllByTestId('library-tile')).toHaveLength(2));
    expect(libraryCalls().at(-1)).toContain('offset=24');
    expect(screen.queryByTestId('library-show-more')).not.toBeInTheDocument();
  });
});

describe('iconKindFor', () => {
  it('derives display kinds from mime and extension', () => {
    expect(iconKindFor('chart.png', 'image/png')).toBe('image');
    expect(iconKindFor('report.pdf', 'application/pdf')).toBe('pdf');
    expect(iconKindFor('sheet.xlsx', 'application/octet-stream')).toBe('xlsx');
    expect(iconKindFor('bundle.zip', 'application/zip')).toBe('archive');
    expect(iconKindFor('mystery.bin', 'application/octet-stream')).toBe('other');
  });
});

describe('generatedFileFromLibraryItem', () => {
  it('folds unknown source surfaces to web and preserves the authed uri', () => {
    const file = generatedFileFromLibraryItem(makeItem({ source_surface: 'toaster' }) as never);
    expect(file.sourceSurface).toBe('web');
    expect(file.uri).toBe('/api/files/22222222-2222-4222-8222-222222222222');
    expect(file.fileName).toBe('report.pdf');
  });
});

// The shared LibraryView reads native export off the transport. A dropped
// field or a swapped-out exporter would silently remove Export as PDF/Word
// from the Library while every other component test keeps passing, so this
// drives the real click path through the real exportDocument service rather
// than asserting on source text.
describe('native artifact export', () => {
  const markdownItem = makeItem({
    id: '44444444-4444-4444-8444-444444444444',
    file_name: 'quarterly-summary.md',
    mime_type: 'text/markdown',
    surface: 'artifact',
    previewable: true,
    uri: '/api/files/44444444-4444-4444-8444-444444444444',
  });

  function stubLibraryAndAsset(content: string) {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/projects')) return projectsResponse([]);
      if (url === markdownItem.uri) {
        return { ok: true, status: 200, text: async () => content } as Response;
      }
      return pageResponse([markdownItem]);
    });
  }

  beforeEach(() => {
    exportDocument.mockClear();
  });

  it('exports the real fetched artifact content as PDF through the shared export service', async () => {
    stubLibraryAndAsset('# Quarterly summary\n\nRevenue is up.');
    render(<LibraryView />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open quarterly-summary.md' }));
    await screen.findByTestId('artifact-renderer');

    fireEvent.click(screen.getByRole('button', { name: 'Download or export artifact' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Export as PDF' }));

    await waitFor(() => expect(exportDocument).toHaveBeenCalledTimes(1));
    expect(exportDocument).toHaveBeenCalledWith(
      '# Quarterly summary\n\nRevenue is up.',
      'pdf',
      'quarterly-summary.md',
      { title: 'quarterly-summary.md' },
    );
  });

  it('exports as Word through the same handler', async () => {
    stubLibraryAndAsset('# Notes');
    render(<LibraryView />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open quarterly-summary.md' }));
    await screen.findByTestId('artifact-renderer');

    fireEvent.click(screen.getByRole('button', { name: 'Download or export artifact' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Export as Word' }));

    await waitFor(() => expect(exportDocument).toHaveBeenCalledTimes(1));
    expect(exportDocument).toHaveBeenCalledWith('# Notes', 'docx', 'quarterly-summary.md', {
      title: 'quarterly-summary.md',
    });
  });

  it('never offers Export as Excel: web has no xlsx writer', async () => {
    stubLibraryAndAsset('# Notes');
    render(<LibraryView />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open quarterly-summary.md' }));
    await screen.findByTestId('artifact-renderer');

    fireEvent.click(screen.getByRole('button', { name: 'Download or export artifact' }));
    expect(screen.queryByRole('button', { name: 'Export as Excel' })).toBeNull();
  });
});
