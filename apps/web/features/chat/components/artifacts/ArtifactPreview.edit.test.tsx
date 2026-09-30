import { describe, it, expect, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
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

async function sourceEditor(): Promise<EditorView> {
  const host = await screen.findByTestId('artifact-source-editor');
  return waitFor(() => {
    const view = EditorView.findFromDOM(host.querySelector<HTMLElement>('.cm-editor')!);
    if (!view) throw new Error('The source editor has not mounted yet');
    return view;
  });
}

function replaceSource(view: EditorView, value: string) {
  act(() => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  });
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

  it('saves an edited source as a new content-keyed version', async () => {
    seedArtifact();
    const view = renderPanel();

    fireEvent.click(screen.getByLabelText('Source'));
    fireEvent.click(screen.getByTestId('artifact-edit-source'));

    const editor = await sourceEditor();
    expect(editor.state.doc.toString()).toBe('<p>original</p>');

    replaceSource(editor, '<p>edited by hand</p>');
    fireEvent.click(screen.getByTestId('artifact-save-source'));

    expect(storedArtifact()?.content).toBe('<p>edited by hand</p>');
    const versions = useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID);
    expect(versions.map((v) => v.content)).toEqual(['<p>original</p>', '<p>edited by hand</p>']);

    view.unmount();
  });

  it('discards the draft on Cancel without touching the store', async () => {
    seedArtifact();
    const view = renderPanel();

    fireEvent.click(screen.getByLabelText('Source'));
    fireEvent.click(screen.getByTestId('artifact-edit-source'));
    replaceSource(await sourceEditor(), '<p>never saved</p>');
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
