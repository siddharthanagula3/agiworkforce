import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ArtifactPreview } from './ArtifactPreview';
import { publishableArtifact } from './ArtifactsPanel';
import { useArtifactsStore } from '../../stores/artifacts-store';

const ARTIFACT_ID = '2a7c4e1b-8d3f-4c2a-9b1e-5f6a7d8c9e01';
const DECK = '# One\n\nFirst\n\n---\n\n## Two\n\nSecond';

function seed() {
  useArtifactsStore.getState().addArtifact({
    id: ARTIFACT_ID,
    type: 'presentation',
    title: 'Deck',
    language: 'markdown',
    content: DECK,
    messageId: 'msg-1',
    conversationId: 'conv-1',
  });
}

function stored() {
  return useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
}

describe('ArtifactPreview · presentation workspace', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens decks in the workspace and saves a theme as a new version', () => {
    seed();
    render(
      <ArtifactPreview
        artifact={stored()}
        variant="panel"
        versionHistory={useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)}
      />,
    );
    expect(screen.getByTestId('presentation-workspace')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('deck-theme-menu'));
    fireEvent.click(screen.getByTestId('deck-menu-theme-editorial'));
    expect(stored().content.startsWith('<!-- deck theme=editorial -->')).toBe(true);
    expect(useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)).toHaveLength(2);
  });

  it('offers a PDF download for a deck', () => {
    seed();
    render(
      <ArtifactPreview
        artifact={stored()}
        variant="panel"
        versionHistory={useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)}
      />,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Download artifact' }), {
      key: 'Enter',
    });
    expect(screen.getByRole('menuitem', { name: 'Download as PDF' })).toBeInTheDocument();
  });

  it('downloads a deck as the slide viewer, not as escaped Markdown', async () => {
    seed();
    const blobs: Blob[] = [];
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn((blob: Blob) => {
          blobs.push(blob);
          return 'blob:https://app.local/deck';
        }),
        revokeObjectURL: vi.fn(),
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(
      <ArtifactPreview
        artifact={stored()}
        variant="panel"
        versionHistory={useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)}
      />,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Download artifact' }), {
      key: 'Enter',
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download as HTML' }));

    await waitFor(() => expect(blobs).toHaveLength(1));
    const html = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blobs[0]!);
    });
    expect(html.match(/<section class="slide"/g)).toHaveLength(2);
    expect(html).toContain('aria-roledescription="slide deck"');
    expect(html).not.toContain('white-space: pre-wrap');
  });

  it('publishes a deck as an interactive page', async () => {
    seed();
    const artifact = await publishableArtifact(stored(), DECK);
    expect(artifact.type).toBe('html');
    expect(artifact.content).toContain('aria-roledescription="slide deck"');
  });
});
