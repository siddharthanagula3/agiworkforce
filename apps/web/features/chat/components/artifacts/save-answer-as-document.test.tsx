import { describe, it, expect, beforeEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { ArtifactPreview } from './ArtifactPreview';
import { documentTitleFromAnswer, useSaveAnswerAsDocument } from './save-answer-as-document';
import { useArtifactsStore } from '../../stores/artifacts-store';

describe('save answer as document', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
    useArtifactsStore.getState().setPanelOpen(false);
  });

  it('titles the document from its heading or first words', () => {
    expect(documentTitleFromAnswer('Intro\n\n## Trip **plan** for May\n\ntext')).toBe(
      'Trip plan for May',
    );
    expect(documentTitleFromAnswer('one two three four five six seven eight nine ten')).toBe(
      'one two three four five six seven eight…',
    );
    expect(documentTitleFromAnswer('   ')).toBe('Saved answer');
  });

  it('creates an editable document from the answer and opens it in the panel', async () => {
    const { result } = renderHook(() => useSaveAnswerAsDocument());
    let id: string | null = null;
    act(() => {
      id = result.current({
        messageId: 'msg-1',
        conversationId: 'conv-1',
        content: '## Packing list\n\n- Passport\n- Charger',
      });
    });
    const store = useArtifactsStore.getState();
    const artifact = store.artifacts.find((a) => a.id === id)!;
    expect(artifact).toMatchObject({
      type: 'document',
      language: 'markdown',
      title: 'Packing list',
      messageId: 'msg-1',
      conversationId: 'conv-1',
    });
    expect(store.panelOpen).toBe(true);
    expect(store.selectedArtifactId).toBe(id);

    render(
      <ArtifactPreview
        artifact={artifact}
        variant="panel"
        versionHistory={store.getArtifactVersions(artifact.id)}
      />,
    );
    fireEvent.click(screen.getByTestId('artifact-edit-document'));
    expect(await screen.findByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
  });

  it('ignores an empty answer', () => {
    const { result } = renderHook(() => useSaveAnswerAsDocument());
    expect(result.current({ messageId: 'm', content: '  ' })).toBeNull();
    expect(useArtifactsStore.getState().artifacts).toHaveLength(0);
  });
});
