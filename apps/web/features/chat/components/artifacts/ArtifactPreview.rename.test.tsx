import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ArtifactPreview } from './ArtifactPreview';
import { useArtifactsStore } from '../../stores/artifacts-store';

const ARTIFACT_ID = '6f1e0c2a-6a43-4f43-9d55-2f0a8e1b7c11';

function seed() {
  useArtifactsStore.getState().addArtifact({
    id: ARTIFACT_ID,
    type: 'document',
    title: 'Draft plan',
    language: 'markdown',
    content: '# Plan\n\nShip it.',
    messageId: 'msg-1',
    conversationId: 'conv-1',
  });
}

function stored() {
  return useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
}

function renderPanel() {
  return render(
    <ArtifactPreview
      artifact={stored()}
      variant="panel"
      versionHistory={useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)}
    />,
  );
}

describe('ArtifactPreview · rename', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
  });

  it('renames from the title without adding a version', () => {
    seed();
    renderPanel();

    fireEvent.click(screen.getByTestId('artifact-title'));
    const input = screen.getByTestId('artifact-title-input');
    fireEvent.change(input, { target: { value: '  Launch   plan ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(stored().title).toBe('Launch plan');
    expect(useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)).toHaveLength(1);
    expect(useArtifactsStore.getState().getConversationArtifacts('conv-1')[0]?.title).toBe(
      'Launch plan',
    );
  });

  it('opens the name field from the More menu and Escape keeps the old name', () => {
    seed();
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'More artifact actions' }));
    fireEvent.click(screen.getByTestId('artifact-rename'));
    const input = screen.getByTestId('artifact-title-input');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'Thrown away' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(stored().title).toBe('Draft plan');
    expect(screen.queryByTestId('artifact-title-input')).not.toBeInTheDocument();
  });

  it('ignores a blank name', () => {
    seed();
    renderPanel();

    fireEvent.click(screen.getByTestId('artifact-title'));
    const input = screen.getByTestId('artifact-title-input');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);

    expect(stored().title).toBe('Draft plan');
  });

  it('keeps a local rename visible over the cloud copy it renamed', () => {
    seed();
    const store = useArtifactsStore.getState();
    store.applyCloudArtifactDeltas([
      {
        id: ARTIFACT_ID,
        conversation_id: 'conv-1',
        message_id: null,
        title: 'Draft plan',
        artifact_type: 'document',
        language: 'markdown',
        content: '# Plan\n\nShip it.',
        current_version: 1,
        pinned: false,
        tags: [],
        server_version: '3',
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-01T00:00:00.000Z',
        deleted_at: null,
      },
    ]);

    expect(store.renameArtifact(ARTIFACT_ID, 'Renamed here')).toBe(true);
    expect(useArtifactsStore.getState().getConversationArtifacts('conv-1')[0]?.title).toBe(
      'Renamed here',
    );
  });
});
