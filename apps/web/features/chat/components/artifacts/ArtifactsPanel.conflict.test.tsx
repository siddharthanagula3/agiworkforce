import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { ChatSyncPushResponse } from '@agiworkforce/cloud-contracts';
import { ArtifactsPanel } from './ArtifactsPanel';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { useStreamingArtifactStore } from '../../stores/streaming-artifact-store';
import { useChatStore } from '@shared/stores/web-chat-store';

vi.mock('./ArtifactPreview', () => ({
  ArtifactPreview: ({ artifact }: { artifact: { title?: string; content?: string } }) => (
    <div data-testid="artifact-preview">{artifact.content}</div>
  ),
}));

const CONVERSATION_ID = '00000000-0000-4000-8000-00000000c101';
const MESSAGE_ID = '00000000-0000-4000-8000-00000000b101';
const ARTIFACT_ID = '00000000-0000-4000-8000-00000000a101';
const NOTICE = 'artifact-conflict-notice';
const MINE = '<main>Mine</main>';
const THEIRS = '<main>Theirs</main>';

function conflictWithServerCopy(): ChatSyncPushResponse {
  return {
    protocolVersion: 2,
    applied: { conversations: [], messages: [], artifacts: [] },
    conflicts: {
      conversations: [],
      messages: [],
      artifacts: [
        {
          id: ARTIFACT_ID,
          current: {
            id: ARTIFACT_ID,
            conversation_id: CONVERSATION_ID,
            message_id: MESSAGE_ID,
            title: 'Shared artifact',
            artifact_type: 'html',
            language: 'html',
            content: THEIRS,
            current_version: 2,
            pinned: false,
            tags: [],
            created_at: new Date().toISOString(),
            updated_at: new Date(Date.now() + 60_000).toISOString(),
            deleted_at: null,
            server_version: '9',
          },
        },
      ],
    },
    cursor: '9',
  };
}

function seedRefusedPush(): void {
  useArtifactsStore.getState().addArtifact({
    id: ARTIFACT_ID,
    type: 'html',
    title: 'Shared artifact',
    language: 'html',
    content: MINE,
    messageId: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
  });
  useArtifactsStore.getState().collectArtifactPushBatch();
  useArtifactsStore.getState().applyArtifactPushResult(conflictWithServerCopy());
}

describe('WEB-ARTIFACTS-STORE-CLOUD-SYNC-CONFLICTS-01 · panel', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
    useStreamingArtifactStore.getState().clearStreamingArtifact();
    useChatStore.setState({ activeConversationId: CONVERSATION_ID });
    useArtifactsStore.getState().setPanelOpen(true);
  });

  it('says the push was refused and shows the version that won', () => {
    act(() => {
      seedRefusedPush();
      useArtifactsStore.getState().selectArtifact(ARTIFACT_ID);
    });

    render(<ArtifactsPanel />);

    expect(screen.getByTestId(NOTICE).textContent).toMatch(/changed this artifact first/i);
    expect(screen.getByTestId('artifact-preview').textContent).toBe(THEIRS);
  });

  it('puts the refused edit back and clears the notice when the user keeps it', () => {
    act(() => {
      seedRefusedPush();
      useArtifactsStore.getState().selectArtifact(ARTIFACT_ID);
    });
    render(<ArtifactsPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Keep my edit' }));

    expect(screen.queryByTestId(NOTICE)).toBeNull();
    expect(screen.getByTestId('artifact-preview').textContent).toBe(MINE);
  });

  it('settles on the server copy when the user keeps theirs', () => {
    act(() => {
      seedRefusedPush();
      useArtifactsStore.getState().selectArtifact(ARTIFACT_ID);
    });
    render(<ArtifactsPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Keep theirs' }));

    expect(screen.queryByTestId(NOTICE)).toBeNull();
    expect(screen.getByTestId('artifact-preview').textContent).toBe(THEIRS);
  });

  it('stays silent for an artifact whose pushes all landed', () => {
    act(() => {
      useArtifactsStore.getState().addArtifact({
        id: ARTIFACT_ID,
        type: 'html',
        title: 'Shared artifact',
        language: 'html',
        content: MINE,
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
      });
      useArtifactsStore.getState().selectArtifact(ARTIFACT_ID);
    });

    render(<ArtifactsPanel />);

    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });
});
