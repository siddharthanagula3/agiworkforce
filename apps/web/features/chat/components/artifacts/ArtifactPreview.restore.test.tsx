import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ArtifactPreview } from './ArtifactPreview';
import { useArtifactsStore } from '../../stores/artifacts-store';

const ARTIFACT_ID = 'artifact-restore-1';

function seedVersions() {
  const store = useArtifactsStore.getState();
  store.addArtifact({
    id: ARTIFACT_ID,
    type: 'html',
    title: 'Landing page',
    language: 'html',
    content: '<p>v1</p>',
    messageId: 'msg-1',
    conversationId: 'conv-1',
  });
  store.upsertArtifact({
    id: ARTIFACT_ID,
    type: 'html',
    title: 'Landing page',
    language: 'html',
    content: '<p>v2</p>',
    messageId: 'msg-1',
    conversationId: 'conv-1',
  });
}

function renderPanel() {
  const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
  return render(
    <ArtifactPreview
      artifact={artifact}
      variant="panel"
      versionHistory={useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)}
    />,
  );
}

function openOlderVersion() {
  fireEvent.click(screen.getByLabelText('Previous version'));
}

describe('restoring an older artifact version', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
  });

  it('asks before replacing what the reader is looking at', () => {
    // Restore fired straight from onClick. The reader saw the content change
    // under them with no warning and nothing naming what had happened.
    seedVersions();
    renderPanel();
    openOlderVersion();

    fireEvent.click(screen.getByTestId('artifact-restore-version'));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/Restore version 1\?/)).toBeInTheDocument();
    expect(useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)).toHaveLength(2);
  });

  it('leaves the artifact untouched when the reader cancels', () => {
    seedVersions();
    renderPanel();
    openOlderVersion();
    fireEvent.click(screen.getByTestId('artifact-restore-version'));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)).toHaveLength(2);
    expect(useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)?.content).toBe(
      '<p>v2</p>',
    );
  });

  it('appends the older content as the new latest once confirmed', () => {
    seedVersions();
    renderPanel();
    openOlderVersion();
    fireEvent.click(screen.getByTestId('artifact-restore-version'));

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    const versions = useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID);
    expect(versions).toHaveLength(3);
    expect(versions[versions.length - 1]?.content).toBe('<p>v1</p>');
  });

  it('says an unsaved edit will be discarded', () => {
    seedVersions();
    renderPanel();

    fireEvent.click(screen.getByLabelText('Source'));
    fireEvent.click(screen.getByTestId('artifact-edit-source'));
    fireEvent.change(screen.getByTestId('artifact-source-editor'), {
      target: { value: '<p>unsaved work</p>' },
    });
    openOlderVersion();
    fireEvent.click(screen.getByTestId('artifact-restore-version'));

    expect(screen.getByRole('alertdialog')).toHaveTextContent(/unsaved edits are discarded/i);
  });
});
