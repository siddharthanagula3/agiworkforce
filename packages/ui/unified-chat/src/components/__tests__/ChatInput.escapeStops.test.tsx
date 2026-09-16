import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '../ChatInput';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';

function renderComposer(onStop = vi.fn(), withSlashMenu = false) {
  render(
    <ChatInput
      onSend={vi.fn()}
      onStop={onStop}
      onModelSelectorClick={vi.fn()}
      hasMessages
      conversationId="conv-1"
      supportsResearch={false}
      {...(withSlashMenu ? { slashCommandHost: { openRewindTimeline: vi.fn() } } : {})}
    />,
  );
  return { onStop, textarea: screen.getByRole('textbox') as HTMLTextAreaElement };
}

describe('Escape while a reply is streaming', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: 'conv-1',
      draftContent: '',
      draftsByConversation: {},
      isStreaming: false,
      conversations: [],
    });
    useModelStore.setState({ selectedModelId: 'auto-economy', models: [] });
  });

  afterEach(() => cleanup());

  it('stops the reply, so the keyboard reaches a control that was mouse-only', () => {
    useChatStore.setState({ isStreaming: true });
    const { onStop, textarea } = renderComposer();

    fireEvent.keyDown(textarea, { key: 'Escape' });

    expect(onStop).toHaveBeenCalledOnce();
  });

  it('does nothing when no reply is running, so it stays free for the surface', () => {
    const { onStop, textarea } = renderComposer();

    fireEvent.keyDown(textarea, { key: 'Escape' });

    expect(onStop).not.toHaveBeenCalled();
  });

  it('closes an open slash menu first rather than stopping on the same press', () => {
    // The menu owns Escape while it is open; stopping would take two meanings
    // from one key and lose the one the user meant.
    useChatStore.setState({ isStreaming: true });
    const { onStop, textarea } = renderComposer(vi.fn(), true);

    fireEvent.change(textarea, { target: { value: '/' } });
    fireEvent.keyDown(textarea, { key: 'Escape' });

    expect(onStop).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(onStop).toHaveBeenCalledOnce();
  });
});
