import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { computeDerivedArtifactId } from '@agiworkforce/artifacts';
import { ArtifactsPanel } from './ArtifactsPanel';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { useStreamingArtifactStore } from '../../stores/streaming-artifact-store';
import { useChatStore } from '@shared/stores/web-chat-store';

vi.mock('./ArtifactPreview', () => ({
  ArtifactPreview: ({ artifact }: { artifact: { title?: string } }) => (
    <div data-testid="artifact-preview">{artifact.title}</div>
  ),
}));

const CONVERSATION_ID = 'conv-stream-test';
const MESSAGE_ID = 'msg-stream-test';
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

    act(() => {
      setStreaming('<!DOCTYPE html>\n<html>\n<body><h1>Hi</h1>');
    });
    expect(screen.getByTestId('streaming-artifact-code').textContent).toContain('<h1>Hi</h1>');
  });

  it('hands off to the persisted ArtifactPreview when the fence closes (same id)', () => {
    setStreaming('<!DOCTYPE html>\n<html>');
    render(<ArtifactsPanel />);
    expect(screen.getByTestId('streaming-artifact')).toBeInTheDocument();

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

  it('sizes the panel header to the panel, not the viewport', () => {
    ['First', 'Second'].forEach((title, index) => {
      useArtifactsStore.getState().addArtifactForMessage(
        `msg-${index}`,
        {
          id: `artifact-${index}`,
          type: 'html',
          language: 'html',
          title,
          content: '<h1>x</h1>',
        },
        CONVERSATION_ID,
      );
    });

    render(<ArtifactsPanel />);

    const label = screen.getByText('Download all');
    expect(label.className).not.toMatch(/(?:^|\s)(?:sm|md|lg|xl|2xl):/);
    expect(label.className).toContain('@[26rem]:inline');

    let ancestor: HTMLElement | null = label.parentElement;
    let containerRoot: HTMLElement | null = null;
    while (ancestor) {
      if (ancestor.classList.contains('@container')) {
        containerRoot = ancestor;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    expect(containerRoot).not.toBeNull();
    expect(containerRoot?.className).toContain('justify-between');
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
