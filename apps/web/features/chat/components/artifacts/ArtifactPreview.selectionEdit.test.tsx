import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ArtifactPreview } from './ArtifactPreview';
import { useArtifactsStore } from '../../stores/artifacts-store';

const ARTIFACT_ID = '0c7b9a52-1f4e-4c9a-8a6e-3a9d2c5e7f10';

function seed(content = '# Plan\n\nWe will ship the beta in March after the security review.') {
  useArtifactsStore.getState().addArtifact({
    id: ARTIFACT_ID,
    type: 'document',
    title: 'Launch plan',
    language: 'markdown',
    content,
    messageId: 'msg-1',
    conversationId: 'conv-1',
  });
}

function stored() {
  return useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
}

function renderPanel(onRequestEdits: (prompt: string) => boolean) {
  return render(
    <ArtifactPreview
      artifact={stored()}
      variant="panel"
      versionHistory={useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)}
      onRequestEdits={onRequestEdits}
    />,
  );
}

function selectText(phrase: string) {
  const preview = screen.getByTestId('artifact-markdown-preview');
  const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node && !node.textContent?.includes(phrase)) node = walker.nextNode();
  if (!node) throw new Error(`"${phrase}" is not rendered`);
  const start = node.textContent!.indexOf(phrase);
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, start + phrase.length);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
  });
}

describe('ArtifactPreview · selection edits', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.getSelection()?.removeAllRanges();
  });

  it('shows a toolbar over selected text and sends a scoped shorten request', () => {
    seed();
    const onRequestEdits = vi.fn(() => true);
    renderPanel(onRequestEdits);

    expect(screen.queryByTestId('artifact-selection-toolbar')).not.toBeInTheDocument();
    selectText('ship the beta in March');
    expect(screen.getByRole('toolbar', { name: 'Selection actions' })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('selection-improve'));
    expect(screen.getByRole('menuitem', { name: 'Spanish' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Executives' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('selection-action-shorten'));

    expect(onRequestEdits).toHaveBeenCalledTimes(1);
    const prompt = (onRequestEdits.mock.calls[0] as unknown as [string])[0];
    expect(prompt).toContain('Edit the artifact "Launch plan"');
    expect(prompt).toContain('ship the beta in March');
    expect(prompt).toContain('Make it noticeably shorter');
    expect(prompt).not.toContain('edited since you last wrote it');
    expect(screen.queryByTestId('artifact-selection-toolbar')).not.toBeInTheDocument();
  });

  it('sends a free-form instruction from Edit with AI', () => {
    seed();
    const onRequestEdits = vi.fn(() => true);
    renderPanel(onRequestEdits);

    selectText('security review');
    fireEvent.click(screen.getByTestId('selection-edit-with-ai'));
    const input = screen.getByPlaceholderText('Describe the change...');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'Name the auditor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send the change request' }));

    const prompt = (onRequestEdits.mock.calls[0] as unknown as [string])[0];
    expect(prompt).toContain('security review');
    expect(prompt).toContain('Requested change: Name the auditor');
  });

  it('includes the current text when the artifact was edited by hand', () => {
    seed();
    useArtifactsStore.getState().upsertArtifact({
      ...stored(),
      content: '# Plan\n\nWe will ship the beta in April after the security review.',
    });
    const onRequestEdits = vi.fn(() => true);
    renderPanel(onRequestEdits);

    selectText('April');
    fireEvent.click(screen.getByTestId('selection-improve'));
    fireEvent.click(screen.getByTestId('selection-action-translate-es'));

    const prompt = (onRequestEdits.mock.calls[0] as unknown as [string])[0];
    expect(prompt).toContain('edited since you last wrote it');
    expect(prompt).toContain('ship the beta in April');
    expect(prompt).toContain('Translate it into Spanish.');
  });

  it('keeps the toolbar when the request is refused', () => {
    seed();
    const onRequestEdits = vi.fn(() => false);
    renderPanel(onRequestEdits);

    selectText('March');
    fireEvent.click(screen.getByTestId('selection-improve'));
    fireEvent.click(screen.getByTestId('selection-action-rewrite'));

    expect(onRequestEdits).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('artifact-selection-toolbar')).toBeInTheDocument();
  });
});
