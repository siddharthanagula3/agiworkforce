import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
    fireEvent.click(screen.getByRole('button', { name: 'More artifact actions' }));
    expect(screen.getByRole('menuitem', { name: 'Download as PDF' })).toBeInTheDocument();
  });

  it('publishes a deck as an interactive page', async () => {
    seed();
    const artifact = await publishableArtifact(stored(), DECK);
    expect(artifact.type).toBe('html');
    expect(artifact.content).toContain('aria-roledescription="slide deck"');
  });
});
