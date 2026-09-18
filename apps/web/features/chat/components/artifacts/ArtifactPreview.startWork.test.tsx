import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ArtifactPreview } from './ArtifactPreview';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { useChatStore } from '@shared/stores/web-chat-store';

const ARTIFACT_ID = 'artifact-start-work-panel';

function seed() {
  useArtifactsStore.getState().addArtifact({
    id: ARTIFACT_ID,
    type: 'html',
    title: 'Landing page',
    language: 'html',
    content: '<p>v1</p>',
    messageId: 'msg-1',
    conversationId: 'conv-1',
  });
}

function renderPanel(variant: 'panel' | 'card' = 'panel') {
  const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
  return render(<ArtifactPreview artifact={artifact} variant={variant} />);
}

beforeEach(() => {
  useArtifactsStore.getState().reset();
  useChatStore.setState({
    draftsByConversation: {},
    composerTogglesByConversation: {},
    activeConversationId: 'conv-1',
  });
});

describe('starting Work from an artifact', () => {
  it('switches the conversation to Work and hands the artifact over as the objective', () => {
    seed();
    renderPanel();

    fireEvent.click(screen.getByTestId('artifact-start-work'));

    const state = useChatStore.getState();
    expect(state.getComposerToggles('conv-1').workMode).toBe('agiwork');
    expect(state.draftsByConversation['conv-1']).toContain('Landing page');
    expect(state.draftsByConversation['conv-1']).toContain(`Source: artifacts/${ARTIFACT_ID}`);
  });

  it('is not offered on the inline card, which has no store artifact behind it', () => {
    seed();
    renderPanel('card');

    expect(screen.queryByTestId('artifact-start-work')).toBeNull();
  });
});
