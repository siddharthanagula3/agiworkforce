import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { ArtifactCodeEditor } from './ArtifactCodeEditor';
import { ArtifactPreview } from './ArtifactPreview';
import { useArtifactsStore } from '../../stores/artifacts-store';

// Real CodeMirror transactions in jsdom; this is not browser keyboard/IME proof.
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

function editorView() {
  const host = screen.getByTestId('artifact-source-editor');
  const dom = host.querySelector<HTMLElement>('.cm-editor');
  if (!dom) throw new Error('CodeMirror did not mount');
  const view = EditorView.findFromDOM(dom);
  if (!view) throw new Error('CodeMirror view was not attached');
  return view;
}

describe('ArtifactCodeEditor external synchronization', () => {
  it('changes the real document without emitting edits or persistence, then reports a genuine edit once', () => {
    const key = 'agi.artifact-draft:editor-sync-fixture';
    const onChange = vi.fn((value: string) => localStorage.setItem(key, value));
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const panel = render(<StrictMode><ArtifactCodeEditor value="initial" onChange={onChange} ariaLabel="Source" /></StrictMode>);
    expect(editorView().state.doc.toString()).toBe('initial');
    expect(onChange).not.toHaveBeenCalled();
    panel.rerender(<StrictMode><ArtifactCodeEditor value="external replacement" onChange={onChange} ariaLabel="Source" /></StrictMode>);
    const editor = editorView();
    expect(editor.state.doc.toString()).toBe('external replacement');
    expect(onChange).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    act(() => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: 'genuine edit' } }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('genuine edit');
    expect(localStorage.getItem(key)).toBe('genuine edit');
    panel.rerender(<StrictMode><ArtifactCodeEditor value="genuine edit" onChange={onChange} ariaLabel="Source" /></StrictMode>);
    panel.unmount();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(writes).toHaveBeenCalledTimes(1);
  });

  it('uses the latest callback for real edits after external replacement', () => {
    const oldChange = vi.fn();
    const latestChange = vi.fn();
    const panel = render(<ArtifactCodeEditor value="first" onChange={oldChange} ariaLabel="Source" />);
    panel.rerender(<ArtifactCodeEditor value="second" onChange={latestChange} ariaLabel="Source" />);
    expect(oldChange).not.toHaveBeenCalled();
    expect(latestChange).not.toHaveBeenCalled();
    const editor = editorView();
    act(() => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: 'third' } }));
    expect(oldChange).not.toHaveBeenCalled();
    expect(latestChange).toHaveBeenCalledExactlyOnceWith('third');
  });
});

const DOCUMENT_ID = 'draft-retention-real-document';
const documentKey = `agi.artifact-draft:${DOCUMENT_ID}`;

function RealDocumentPanel() {
  const artifact = useArtifactsStore((s) => s.artifacts.find((a) => a.id === DOCUMENT_ID));
  const getVersions = useArtifactsStore((s) => s.getArtifactVersions);
  return artifact ? <ArtifactPreview artifact={artifact} variant="panel" versionHistory={getVersions(DOCUMENT_ID)} /> : null;
}

function seedDocument(content: string) {
  useArtifactsStore.getState().addArtifact({
    id: DOCUMENT_ID, type: 'document', title: 'Notes', language: 'markdown', content,
    messageId: 'document-message', conversationId: 'document-conversation',
  });
}

describe('real document editor bindings to Preview recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    useArtifactsStore.getState().reset();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ items: [], comments: [] })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('retains a real rich-editor toolbar update on immediate unmount', async () => {
    seedDocument('First line\n\nSecond line');
    const panel = render(<RealDocumentPanel />);
    fireEvent.click(screen.getByTestId('artifact-edit-document'));
    const style = await screen.findByTestId('document-text-style');
    expect(screen.getByTestId('artifact-document-editor')).toBeInTheDocument();
    expect(localStorage.getItem(documentKey)).toBeNull();
    fireEvent.change(style, { target: { value: 'h2' } });
    const latest = '## First line\n\nSecond line';
    expect(localStorage.getItem(documentKey)).toBe(latest);
    panel.unmount();
    expect(localStorage.getItem(documentKey)).toBe(latest);
    expect(useArtifactsStore.getState().getArtifactVersions(DOCUMENT_ID)).toHaveLength(1);
  });

  it('retains an edit made through the actual Markdown fallback CodeMirror', async () => {
    seedDocument('# Notes\n\n$x$');
    const panel = render(<RealDocumentPanel />);
    fireEvent.click(screen.getByTestId('artifact-edit-document'));
    await screen.findByText(/This document uses formatting the document editor cannot keep/);
    await waitFor(() => expect(screen.getByTestId('artifact-source-editor')).toBeInTheDocument());
    expect(screen.queryByTestId('artifact-document-editor')).not.toBeInTheDocument();
    expect(localStorage.getItem(documentKey)).toBeNull();
    const editor = editorView();
    act(() => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: '# Notes\n\n$x+y$' } }));
    panel.unmount();
    expect(localStorage.getItem(documentKey)).toBe('# Notes\n\n$x+y$');
    expect(useArtifactsStore.getState().getArtifactVersions(DOCUMENT_ID)).toHaveLength(1);
  });
});
