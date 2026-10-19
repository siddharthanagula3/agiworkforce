import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => headers),
  getCsrfToken: vi.fn(async () => 't'),
}));

const { ArtifactPreview } = await import('../ArtifactPreview');
const { resetStudioLibrary } = await import('./studio-library-client');
const { useArtifactsStore } = await import('../../../stores/artifacts-store');

const BRAND = {
  id: 'c0000000-0000-4000-8000-000000000003',
  kind: 'brand',
  name: 'Acme',
  payload: {
    background: '#101820',
    text: '#ffffff',
    accent: '#f2aa4c',
    headingFont: 'serif',
    bodyFont: 'sans',
    voice: 'Plain and warm',
  },
  createdAt: 'x',
};

function seed(type: 'document' | 'presentation', content: string) {
  useArtifactsStore.getState().addArtifact({
    id: '1e2d3c4b-5a69-4788-9a0b-1c2d3e4f5a6b',
    type,
    title: 'Thing',
    language: 'markdown',
    content,
    messageId: 'm1',
    conversationId: 'c1',
  });
  return useArtifactsStore.getState().artifacts[0]!;
}

beforeEach(() => {
  resetStudioLibrary();
  useArtifactsStore.getState().reset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ items: [BRAND] }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('brands in the artifact panel', () => {
  it('rewrites a document in a saved brand voice', async () => {
    const artifact = seed('document', '# Thing\n\nText');
    const onRequestEdits = vi.fn(() => true);
    render(
      <ArtifactPreview
        artifact={artifact}
        variant="panel"
        versionHistory={[]}
        onRequestEdits={onRequestEdits}
      />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'More artifact actions' }));
    fireEvent.click(await screen.findByTestId('artifact-apply-brand'));
    const prompt = (onRequestEdits.mock.calls[0] as unknown as [string])[0];
    expect(prompt).toContain('in the Acme house style');
    expect(prompt).toContain('House voice: Plain and warm');
  });

  it('applies a saved brand to a deck from the Theme menu', async () => {
    const artifact = seed('presentation', '# One\n\n---\n\n## Two');
    render(
      <ArtifactPreview
        artifact={artifact}
        variant="panel"
        versionHistory={useArtifactsStore.getState().getArtifactVersions(artifact.id)}
      />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('deck-theme-menu'));
    fireEvent.click(await screen.findByTestId(`deck-menu-brand-${BRAND.id}`));
    const content = useArtifactsStore.getState().artifacts[0]!.content;
    expect(content).toContain('theme=custom');
    expect(content).toContain('bg=#101820');
    expect(content).toContain('heading=serif');
    expect(
      within(screen.getByTestId('presentation-workspace')).getAllByTestId('deck-slide').length,
    ).toBeGreaterThan(0);
  });
});
