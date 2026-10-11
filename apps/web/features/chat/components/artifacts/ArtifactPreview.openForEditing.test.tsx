import { describe, it, expect, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { ArtifactPreview, type ArtifactData } from './ArtifactPreview';
import { useArtifactsStore } from '../../stores/artifacts-store';

const ARTIFACT_ID = 'artifact-open-for-editing';

function seedArtifact(overrides: Partial<ArtifactData> = {}) {
  useArtifactsStore.getState().addArtifact({
    id: ARTIFACT_ID,
    type: 'html',
    title: 'Landing page',
    language: 'html',
    content: '<p>original</p>',
    messageId: 'msg-1',
    conversationId: 'conv-1',
    ...overrides,
  });
}

function LivePanel() {
  const artifact = useArtifactsStore((s) => s.artifacts.find((a) => a.id === ARTIFACT_ID));
  const getArtifactVersions = useArtifactsStore((s) => s.getArtifactVersions);
  if (!artifact) return null;
  return (
    <ArtifactPreview
      artifact={artifact}
      variant="panel"
      versionHistory={getArtifactVersions(ARTIFACT_ID)}
    />
  );
}

async function sourceEditor(): Promise<EditorView> {
  const host = await screen.findByTestId('artifact-source-editor');
  return waitFor(() => {
    const view = EditorView.findFromDOM(host.querySelector<HTMLElement>('.cm-editor')!);
    if (!view) throw new Error('The source editor has not mounted yet');
    return view;
  });
}

function previewFrame(): HTMLIFrameElement {
  return screen.getByTitle('Landing page') as HTMLIFrameElement;
}

describe('ArtifactPreview · opened from a code block Edit button', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
  });

  it('opens a renderable artifact straight into the focused source editor', async () => {
    seedArtifact();
    useArtifactsStore.getState().openArtifactForEditing(ARTIFACT_ID);
    const view = render(<LivePanel />);

    const editor = await sourceEditor();
    expect(editor.state.doc.toString()).toBe('<p>original</p>');
    await waitFor(() => expect(editor.hasFocus).toBe(true));
    expect(screen.getByLabelText('Source').className).toContain('text-primary');
    expect(screen.getByTestId('artifact-save-source')).toBeTruthy();
    expect(useArtifactsStore.getState().editRequestedArtifactId).toBeNull();

    view.unmount();
  });

  it.each([
    { type: 'code' as const, language: 'python', content: 'print("hi")' },
    { type: 'document' as const, language: 'markdown', content: '# Notes\n\n- one' },
    { type: 'svg' as const, language: 'svg', content: '<svg viewBox="0 0 1 1"></svg>' },
    { type: 'react' as const, language: 'tsx', content: 'export default () => <p>hi</p>;' },
  ])('opens a $language artifact in the source editor too', async (fields) => {
    seedArtifact(fields);
    useArtifactsStore.getState().openArtifactForEditing(ARTIFACT_ID);
    const view = render(<LivePanel />);

    const editor = await sourceEditor();
    expect(editor.state.doc.toString()).toBe(fields.content);
    await waitFor(() => expect(editor.hasFocus).toBe(true));

    view.unmount();
  });

  it('keeps the preview default for an artifact selected any other way', () => {
    seedArtifact();
    useArtifactsStore.getState().openArtifactForEditing(ARTIFACT_ID);
    useArtifactsStore.getState().selectArtifact(ARTIFACT_ID);
    const view = render(<LivePanel />);

    expect(screen.queryByTestId('artifact-source-editor')).toBeNull();
    expect(screen.getByLabelText('Preview').className).toContain('text-primary');
    expect(previewFrame()).toBeTruthy();

    view.unmount();
  });

  it('leaves the request for the panel when the artifact is shown as a transcript card', () => {
    seedArtifact();
    useArtifactsStore.getState().openArtifactForEditing(ARTIFACT_ID);
    const artifact = useArtifactsStore.getState().artifacts[0]!;
    const view = render(<ArtifactPreview artifact={artifact} />);

    expect(screen.queryByTestId('artifact-source-editor')).toBeNull();
    expect(useArtifactsStore.getState().editRequestedArtifactId).toBe(ARTIFACT_ID);

    view.unmount();
  });

  it('shows the saved source when switching to Preview after an edit', async () => {
    seedArtifact();
    useArtifactsStore.getState().openArtifactForEditing(ARTIFACT_ID);
    const view = render(<LivePanel />);

    const editor = await sourceEditor();
    act(() => {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: '<p>saved by hand</p>' },
      });
    });
    fireEvent.click(screen.getByTestId('artifact-save-source'));
    fireEvent.click(screen.getByLabelText('Preview'));

    await waitFor(() => expect(previewFrame().getAttribute('srcdoc')).toContain('saved by hand'));
    expect(previewFrame().getAttribute('srcdoc')).not.toContain('original');

    view.unmount();
  });
});
