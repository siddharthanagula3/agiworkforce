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
import { render, screen, waitFor } from '@testing-library/react';
import { LibraryView, type LibraryTransport } from '../LibraryView';

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
    restoreItem: vi.fn(async () => jsonResponse({})),
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

  it('passes the active filters to the host rather than filtering locally', async () => {
    const transport = makeTransport();
    render(<LibraryView transport={transport} />);

    await waitFor(() => expect(transport.listPage).toHaveBeenCalled());
    const params = (transport.listPage as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as URLSearchParams;
    expect(params.get('limit')).toBeTruthy();
  });

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
});
