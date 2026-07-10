/**
 * Component tests for LibraryView — the /library page body.
 *
 * Covers:
 *   - Signed-out: no fetch fires (auth-gated data loading).
 *   - Grid renders shared GeneratedFileCards from the API page.
 *   - Filter chips re-fetch with origin/kind params.
 *   - Search box sends the debounced q param.
 *   - Honest empty states (default vs. uploaded vs. search miss).
 *   - Error state with a Retry that re-fetches.
 *   - Show more appends the next offset page.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(() => ({ isSignedIn: true })),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: mockUseAuth,
}));

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

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(pageResponse([makeItem()]));
  mockUseAuth.mockReturnValue({ isSignedIn: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('LibraryView', () => {
  it('never fetches while signed out', async () => {
    mockUseAuth.mockReturnValue({ isSignedIn: false });
    render(<LibraryView />);
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders the fetched page as shared GeneratedFileCards', async () => {
    render(<LibraryView />);
    await waitFor(() => expect(screen.getByTestId('library-grid')).toBeInTheDocument());
    expect(screen.getAllByTestId('generated-file-card')).toHaveLength(1);
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('/api/library?');
    expect(url).not.toContain('origin=');
    expect(url).not.toContain('kind=');
  });

  it('re-fetches with origin/kind params when filter chips are clicked', async () => {
    render(<LibraryView />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Generated' }));
    await waitFor(() =>
      expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('origin=generated'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Images' }));
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('kind=image'));
  });

  it('sends the debounced search query as q', async () => {
    render(<LibraryView />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Search library files'), {
      target: { value: 'quarterly' },
    });
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('q=quarterly'));
  });

  it('shows the honest default empty state', async () => {
    fetchMock.mockResolvedValue(pageResponse([]));
    render(<LibraryView />);
    await waitFor(() => expect(screen.getByTestId('library-empty-state')).toBeInTheDocument());
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('tells the truth on the Uploaded filter: uploads are not cataloged yet', async () => {
    fetchMock.mockResolvedValue(pageResponse([]));
    render(<LibraryView />);
    fireEvent.click(screen.getByRole('button', { name: 'Uploaded' }));
    await waitFor(() =>
      expect(screen.getByText(/aren’t cataloged in the Library yet/)).toBeInTheDocument(),
    );
  });

  it('surfaces load failures with a Retry that re-fetches', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    render(<LibraryView />);
    await waitFor(() => expect(screen.getByTestId('library-error')).toBeInTheDocument());

    fetchMock.mockResolvedValueOnce(pageResponse([makeItem()]));
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    await waitFor(() => expect(screen.getByTestId('library-grid')).toBeInTheDocument());
    expect(screen.queryByTestId('library-error')).not.toBeInTheDocument();
  });

  it('appends the next page via Show more', async () => {
    fetchMock.mockResolvedValueOnce(pageResponse([makeItem()], true, 24));
    render(<LibraryView />);
    await waitFor(() => expect(screen.getByTestId('library-show-more')).toBeInTheDocument());

    fetchMock.mockResolvedValueOnce(
      pageResponse(
        [makeItem({ id: '33333333-3333-4333-8333-333333333333', file_name: 'data.csv' })],
        false,
        null,
      ),
    );
    fireEvent.click(screen.getByTestId('library-show-more'));
    await waitFor(() => expect(screen.getAllByTestId('generated-file-card')).toHaveLength(2));
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('offset=24');
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
    const file = generatedFileFromLibraryItem(makeItem({ source_surface: 'toaster' }) as any);
    expect(file.sourceSurface).toBe('web');
    expect(file.uri).toBe('/api/files/22222222-2222-4222-8222-222222222222');
    expect(file.fileName).toBe('report.pdf');
  });
});
