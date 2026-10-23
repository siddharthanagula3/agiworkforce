import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  message: vi.fn(),
  loading: vi.fn(),
}));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => headers),
  getCsrfToken: vi.fn(async () => 't'),
}));

const { ArtifactPreview } = await import('./ArtifactPreview');
const { useArtifactsStore } = await import('../../stores/artifacts-store');

const ID = '8c7b6a5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d';

function addArtifact(patch: Record<string, unknown>) {
  useArtifactsStore.getState().addArtifact({
    id: ID,
    type: 'document',
    title: 'Plan',
    language: 'markdown',
    content: '# Plan\n\nShip.',
    messageId: 'm',
    conversationId: 'c',
    ...patch,
  } as never);
}

beforeEach(() => {
  useArtifactsStore.getState().reset();
  toast.success.mockClear();
  toast.error.mockClear();
});

afterEach(() => vi.unstubAllGlobals());

function openMenu() {
  const artifact = useArtifactsStore.getState().artifacts[0]!;
  render(<ArtifactPreview artifact={artifact} variant="panel" versionHistory={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'More artifact actions' }));
}

function saveCalls(fetchMock: ReturnType<typeof vi.fn>, path: string) {
  return fetchMock.mock.calls.filter(([input]) => String(input) === path) as unknown as Array<
    [string, RequestInit]
  >;
}

describe('Save to Google Drive and OneDrive', () => {
  it('lists both destinations after Google Docs', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ items: [] }))),
    );
    addArtifact({});
    openMenu();
    const ids = screen
      .getAllByRole('menuitem')
      .map((item) => item.getAttribute('data-testid'))
      .filter((id) => id?.startsWith('artifact-save-'));
    const start = ids.indexOf('artifact-save-google-docs');
    expect(ids.slice(start, start + 3)).toEqual([
      'artifact-save-google-docs',
      'artifact-save-drive',
      'artifact-save-onedrive',
    ]);
  });

  it('saves an HTML artifact to Drive as an HTML file', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/artifacts/save-to-drive'
        ? new Response(
            JSON.stringify({ fileName: 'Landing.html', url: 'https://drive.google.com/f/1' }),
            { status: 201 },
          )
        : new Response(JSON.stringify({ items: [] })),
    );
    vi.stubGlobal('fetch', fetchMock);
    addArtifact({ type: 'html', language: 'html', title: 'Landing', content: '<h1>Hi</h1>' });
    openMenu();
    fireEvent.click(screen.getByTestId('artifact-save-drive'));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Saved to Google Drive', expect.anything()),
    );
    const [call] = saveCalls(fetchMock, '/api/artifacts/save-to-drive');
    expect(JSON.parse(String(call![1].body))).toEqual({
      fileName: 'Landing.html',
      mimeType: 'text/html',
      encoding: 'utf8',
      content: '<h1>Hi</h1>',
    });
  });

  it('saves a Markdown document to the OneDrive app folder and says so', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/artifacts/save-to-onedrive'
        ? new Response(JSON.stringify({ fileName: 'Plan.md' }), { status: 201 })
        : new Response(JSON.stringify({ items: [] })),
    );
    vi.stubGlobal('fetch', fetchMock);
    addArtifact({});
    openMenu();
    fireEvent.click(screen.getByTestId('artifact-save-onedrive'));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Saved to the app folder in OneDrive', {}),
    );
    const [call] = saveCalls(fetchMock, '/api/artifacts/save-to-onedrive');
    expect(JSON.parse(String(call![1].body))).toEqual({
      fileName: 'Plan.md',
      mimeType: 'text/markdown',
      encoding: 'utf8',
      content: '# Plan\n\nShip.',
    });
  });

  it('sends a PDF artifact as its original bytes', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/artifacts/save-to-drive') {
        return new Response(JSON.stringify({ fileName: 'Report.pdf' }), { status: 201 });
      }
      if (url.startsWith('data:application/pdf')) {
        return new Response(Uint8Array.from([0x25, 0x50, 0x44, 0x46]), {
          headers: { 'content-type': 'application/pdf' },
        });
      }
      return new Response(JSON.stringify({ items: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    addArtifact({
      type: 'document',
      language: 'pdf',
      title: 'Report',
      content: 'data:application/pdf;base64,JVBERg==',
    });
    openMenu();
    fireEvent.click(screen.getByTestId('artifact-save-drive'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [call] = saveCalls(fetchMock, '/api/artifacts/save-to-drive');
    expect(JSON.parse(String(call![1].body))).toEqual({
      fileName: 'Report.pdf',
      mimeType: 'application/pdf',
      encoding: 'base64',
      content: 'JVBERg==',
    });
  });

  it('points to the connectors page when OneDrive is not connected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/artifacts/save-to-onedrive'
          ? new Response(
              JSON.stringify({
                error: {
                  code: 'onedrive_not_connected',
                  message: 'Connect OneDrive to save files to it.',
                },
              }),
              { status: 409 },
            )
          : new Response(JSON.stringify({ items: [] })),
      ),
    );
    addArtifact({});
    openMenu();
    fireEvent.click(screen.getByTestId('artifact-save-onedrive'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Connect OneDrive to save files to it.',
        expect.objectContaining({ action: expect.objectContaining({ label: 'Open connectors' }) }),
      ),
    );
  });

  it('does not call the server for a file over the size limit', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [] })));
    vi.stubGlobal('fetch', fetchMock);
    addArtifact({ content: '€'.repeat(1_000_001) });
    openMenu();
    fireEvent.click(screen.getByTestId('artifact-save-drive'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'This file is too large to save to Google Drive from here.',
      ),
    );
    expect(saveCalls(fetchMock, '/api/artifacts/save-to-drive')).toHaveLength(0);
  });

  it('reports a failed save without a connector refusal in plain words', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/artifacts/save-to-drive'
          ? new Response(JSON.stringify({ error: { code: 'CONFLICT' } }), { status: 409 })
          : new Response(JSON.stringify({ items: [] })),
      ),
    );
    addArtifact({});
    openMenu();
    fireEvent.click(screen.getByTestId('artifact-save-drive'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('The file was not saved to Google Drive.', {}),
    );
  });
});
