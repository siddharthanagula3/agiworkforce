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

beforeEach(() => {
  useArtifactsStore.getState().reset();
  useArtifactsStore.getState().addArtifact({
    id: ID,
    type: 'document',
    title: 'Plan',
    language: 'markdown',
    content: '# Plan\n\nShip.',
    messageId: 'm',
    conversationId: 'c',
  });
});

afterEach(() => vi.unstubAllGlobals());

function open() {
  const artifact = useArtifactsStore.getState().artifacts[0]!;
  render(<ArtifactPreview artifact={artifact} variant="panel" versionHistory={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'More artifact actions' }));
  fireEvent.click(screen.getByTestId('artifact-save-google-docs'));
}

describe('Save to Google Docs', () => {
  it('sends the document and offers to open the new Google Doc', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('google-docs')
        ? new Response(JSON.stringify({ url: 'https://docs.google.com/document/d/x/edit' }), {
            status: 201,
          })
        : new Response(JSON.stringify({ items: [] })),
    );
    vi.stubGlobal('fetch', fetchMock);
    open();
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Saved to Google Docs', expect.anything()),
    );
    const call = fetchMock.mock.calls.find(([input]) =>
      String(input).includes('google-docs'),
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(String(call[1].body))).toEqual({ title: 'Plan', content: '# Plan\n\nShip.' });
  });

  it('points to the connectors page when Drive is not connected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('google-docs')
          ? new Response(
              JSON.stringify({
                error: {
                  code: 'google_drive_not_connected',
                  message: 'Connect Google Drive to save documents to it.',
                },
              }),
              { status: 409 },
            )
          : new Response(JSON.stringify({ items: [] })),
      ),
    );
    open();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Connect Google Drive to save documents to it.',
        expect.objectContaining({ action: expect.objectContaining({ label: 'Open connectors' }) }),
      ),
    );
  });
});
