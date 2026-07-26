import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { computeDerivedArtifactId } from '@agiworkforce/artifacts';
import { ArtifactsPanel } from './ArtifactsPanel';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { useStreamingArtifactStore } from '../../stores/streaming-artifact-store';
import { useChatStore } from '@shared/stores/web-chat-store';

// The full ArtifactPreview drags in the sandbox/iframe stack; the handoff test
// only needs to know WHICH viewer the panel chose, so stub it.
vi.mock('./ArtifactPreview', () => ({
  ArtifactPreview: ({ artifact }: { artifact: { title?: string } }) => (
    <div data-testid="artifact-preview">{artifact.title}</div>
  ),
}));

const CONVERSATION_ID = 'conv-stream-test';
const MESSAGE_ID = 'msg-stream-test';
// Deterministic id shared by the streaming placeholder and the persisted artifact.
const ARTIFACT_ID = computeDerivedArtifactId(CONVERSATION_ID, MESSAGE_ID, 0);

function setStreaming(content: string) {
  useStreamingArtifactStore.getState().setStreamingArtifact({
    artifactId: ARTIFACT_ID,
    messageId: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    type: 'html',
    language: 'html',
    title: 'Emoji Popper',
    content,
  });
}

describe('ArtifactsPanel · live artifact streaming', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
    useStreamingArtifactStore.getState().clearStreamingArtifact();
    useChatStore.setState({ activeConversationId: CONVERSATION_ID });
    useArtifactsStore.getState().setPanelOpen(true);
    useArtifactsStore.getState().selectArtifact(ARTIFACT_ID);
  });

  it('renders the streaming view with partial content that grows across chunks', () => {
    setStreaming('<!DOCTYPE html>');
    render(<ArtifactsPanel />);

    expect(screen.getByTestId('streaming-artifact')).toBeInTheDocument();
    expect(screen.getByText('Writing…')).toBeInTheDocument();
    expect(screen.getByTestId('streaming-artifact-code').textContent).toContain('<!DOCTYPE html>');
    expect(screen.queryByTestId('artifact-preview')).not.toBeInTheDocument();

    // Simulated stream: more chunks arrive
    act(() => {
      setStreaming('<!DOCTYPE html>\n<html>\n<body><h1>Hi</h1>');
    });
    expect(screen.getByTestId('streaming-artifact-code').textContent).toContain('<h1>Hi</h1>');
  });

  it('hands off to the persisted ArtifactPreview when the fence closes (same id)', () => {
    setStreaming('<!DOCTYPE html>\n<html>');
    render(<ArtifactsPanel />);
    expect(screen.getByTestId('streaming-artifact')).toBeInTheDocument();

    // Fence closes: the persisted artifact lands under the SAME deterministic
    // id and the ephemeral streaming entry clears (what MessageBubble's
    // extraction effects + the sync hook do in production).
    act(() => {
      useArtifactsStore.getState().addArtifactForMessage(
        MESSAGE_ID,
        {
          id: ARTIFACT_ID,
          type: 'html',
          language: 'html',
          title: 'Emoji Popper',
          content: '<!DOCTYPE html>\n<html>\n<body></body>\n</html>',
        },
        CONVERSATION_ID,
      );
      useStreamingArtifactStore.getState().clearStreamingArtifact(MESSAGE_ID);
    });

    expect(screen.queryByTestId('streaming-artifact')).not.toBeInTheDocument();
    expect(screen.getByTestId('artifact-preview')).toBeInTheDocument();
    expect(screen.getByTestId('artifact-preview').textContent).toContain('Emoji Popper');
  });

  it('suppresses the streaming placeholder once a persisted artifact with the same id exists', () => {
    // Persisted artifact already landed but a stale streaming entry lingers:
    // the panel must prefer the persisted viewer (no duplicate tab/view).
    useArtifactsStore.getState().addArtifactForMessage(
      MESSAGE_ID,
      {
        id: ARTIFACT_ID,
        type: 'html',
        language: 'html',
        title: 'Emoji Popper',
        content: '<!DOCTYPE html><html></html>',
      },
      CONVERSATION_ID,
    );
    setStreaming('<!DOCTYPE html>');

    render(<ArtifactsPanel />);
    expect(screen.queryByTestId('streaming-artifact')).not.toBeInTheDocument();
    expect(screen.getByTestId('artifact-preview')).toBeInTheDocument();
  });

  it('does not show another conversation’s streaming artifact', () => {
    useStreamingArtifactStore.getState().setStreamingArtifact({
      artifactId: 'other-id',
      messageId: 'other-msg',
      conversationId: 'other-conversation',
      type: 'html',
      language: 'html',
      title: 'Other',
      content: '<div>',
    });
    render(<ArtifactsPanel />);
    expect(screen.queryByTestId('streaming-artifact')).not.toBeInTheDocument();
    expect(screen.getByText('No artifacts yet')).toBeInTheDocument();
    expect(
      screen.getByText('Renderable code and generated files will appear here'),
    ).toBeInTheDocument();
  });

  it('shows when cloud artifact sync failed and is retrying', () => {
    useArtifactsStore.getState().setCloudSyncStatus('error', 'network unavailable');
    render(<ArtifactsPanel />);

    expect(screen.getByText('Sync retrying')).toHaveAttribute('title', 'network unavailable');
  });

  it('falls back to the first artifact in the active conversation when selection is stale', () => {
    useArtifactsStore.getState().addArtifactForMessage(
      'old-message',
      {
        id: 'old-artifact',
        type: 'html',
        language: 'html',
        title: 'Old conversation artifact',
        content: '<h1>Old</h1>',
      },
      'old-conversation',
    );
    useArtifactsStore.getState().selectArtifact('old-artifact');
    useArtifactsStore.getState().addArtifactForMessage(
      MESSAGE_ID,
      {
        id: 'current-artifact',
        type: 'html',
        language: 'html',
        title: 'Current conversation artifact',
        content: '<h1>Current</h1>',
      },
      CONVERSATION_ID,
    );

    render(<ArtifactsPanel />);

    expect(screen.getByTestId('artifact-preview')).toHaveTextContent(
      'Current conversation artifact',
    );
    expect(screen.queryByText('No artifacts yet')).not.toBeInTheDocument();
  });
});
