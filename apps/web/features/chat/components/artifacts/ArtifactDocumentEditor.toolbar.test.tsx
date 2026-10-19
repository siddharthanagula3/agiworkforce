import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ArtifactPreview } from './ArtifactPreview';
import { useArtifactsStore } from '../../stores/artifacts-store';

const ARTIFACT_ID = 'b3d1c0a8-9e2f-4b6a-8c1d-7e5f4a3b2c19';

function seed() {
  useArtifactsStore.getState().addArtifact({
    id: ARTIFACT_ID,
    type: 'document',
    title: 'Notes',
    language: 'markdown',
    content: 'First line\n\nSecond line',
    messageId: 'msg-1',
    conversationId: 'conv-1',
  });
}

function stored() {
  return useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
}

describe('ArtifactDocumentEditor · formatting toolbar', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
  });

  it('opens the document in the rich editor and sets a heading level from the toolbar', async () => {
    seed();
    render(
      <ArtifactPreview
        artifact={stored()}
        variant="panel"
        versionHistory={useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)}
      />,
    );

    fireEvent.click(screen.getByTestId('artifact-edit-document'));
    const textStyle = (await screen.findByTestId('document-text-style')) as HTMLSelectElement;
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
    expect(textStyle.value).toBe('p');

    fireEvent.change(textStyle, { target: { value: 'h2' } });
    await waitFor(() => expect(textStyle.value).toBe('h2'));

    fireEvent.click(screen.getByTestId('artifact-save-source'));
    expect(stored().content.startsWith('## First line')).toBe(true);
    expect(useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)).toHaveLength(2);
  });

  it('toggles bold and reports it as pressed', async () => {
    seed();
    render(
      <ArtifactPreview
        artifact={stored()}
        variant="panel"
        versionHistory={useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)}
      />,
    );

    fireEvent.click(screen.getByTestId('artifact-edit-document'));
    const bold = await screen.findByRole('button', { name: 'Bold' });
    expect(bold).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(bold);
    await waitFor(() => expect(bold).toHaveAttribute('aria-pressed', 'true'));
  });
});
