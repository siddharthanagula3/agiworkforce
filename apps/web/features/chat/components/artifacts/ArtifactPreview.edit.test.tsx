import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ArtifactPreview } from './ArtifactPreview';
import { useArtifactsStore } from '../../stores/artifacts-store';

const ARTIFACT_ID = 'artifact-edit-1';

function seedArtifact(content = '<p>original</p>') {
  useArtifactsStore.getState().addArtifact({
    id: ARTIFACT_ID,
    type: 'html',
    title: 'Landing page',
    language: 'html',
    content,
    messageId: 'msg-1',
    conversationId: 'conv-1',
  });
}

function storedArtifact() {
  return useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID);
}

function renderPanel() {
  const artifact = storedArtifact()!;
  return render(
    <ArtifactPreview
      artifact={artifact}
      variant="panel"
      versionHistory={useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)}
    />,
  );
}

describe('ArtifactPreview · manual source editing', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
  });

  it('saves an edited source as a new content-keyed version', () => {
    seedArtifact();
    const view = renderPanel();

    fireEvent.click(screen.getByLabelText('Source'));
    fireEvent.click(screen.getByTestId('artifact-edit-source'));

    const editor = screen.getByTestId('artifact-source-editor') as HTMLTextAreaElement;
    expect(editor.value).toBe('<p>original</p>');

    fireEvent.change(editor, { target: { value: '<p>edited by hand</p>' } });
    fireEvent.click(screen.getByTestId('artifact-save-source'));

    expect(storedArtifact()?.content).toBe('<p>edited by hand</p>');
    const versions = useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID);
    expect(versions.map((v) => v.content)).toEqual(['<p>original</p>', '<p>edited by hand</p>']);

    view.unmount();
  });

  it('discards the draft on Cancel without touching the store', () => {
    seedArtifact();
    const view = renderPanel();

    fireEvent.click(screen.getByLabelText('Source'));
    fireEvent.click(screen.getByTestId('artifact-edit-source'));
    fireEvent.change(screen.getByTestId('artifact-source-editor'), {
      target: { value: '<p>never saved</p>' },
    });
    fireEvent.click(screen.getByTestId('artifact-cancel-source-edit'));

    expect(screen.queryByTestId('artifact-source-editor')).toBeNull();
    expect(storedArtifact()?.content).toBe('<p>original</p>');
    expect(useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)).toHaveLength(1);

    view.unmount();
  });

  it('offers no edit control for an artifact that is not in the store', () => {
    const view = render(
      <ArtifactPreview
        artifact={{ id: 'not-stored', type: 'html', title: 'Orphan', content: '<p>x</p>' }}
        variant="panel"
      />,
    );

    fireEvent.click(screen.getByLabelText('Source'));
    expect(screen.queryByTestId('artifact-edit-source')).toBeNull();

    view.unmount();
  });

  it('offers no edit control while an older version is being viewed', () => {
    seedArtifact();
    useArtifactsStore.getState().upsertArtifact({
      ...storedArtifact()!,
      content: '<p>second</p>',
    });
    const view = renderPanel();

    fireEvent.click(screen.getByLabelText('Source'));
    expect(screen.getByTestId('artifact-edit-source')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Previous version'));
    expect(screen.queryByTestId('artifact-edit-source')).toBeNull();

    view.unmount();
  });
});
