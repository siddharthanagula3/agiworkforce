import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPOSER_SEND_ACCEPTED, ChatInput, type ChatInputProps } from '../ChatInput';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';

const OFFLINE = "You're offline. Reconnect to send messages.";

function composer(onSend: ChatInputProps['onSend'], sendBlockedReason?: string) {
  return (
    <ChatInput
      onSend={onSend}
      onStop={vi.fn()}
      onModelSelectorClick={vi.fn()}
      hasMessages
      conversationId="conv-1"
      supportsResearch={false}
      sendBlockedReason={sendBlockedReason}
    />
  );
}

function sendButton() {
  return screen.getByRole('button', { name: /send message/i }) as HTMLButtonElement;
}

describe('a composer that cannot send right now', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: 'conv-1',
      draftContent: 'a draft written before the connection dropped',
      draftsByConversation: {},
      isStreaming: false,
      conversations: [],
    });
    useModelStore.setState({ selectedModelId: 'auto-economy', models: [] });
  });

  afterEach(() => cleanup());

  it('shows the reason, disables send and keeps the draft editable', () => {
    const onSend = vi.fn(() => COMPOSER_SEND_ACCEPTED);
    render(composer(onSend, OFFLINE));
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    expect(screen.getByTestId('composer-send-blocked').textContent).toBe(OFFLINE);
    expect(sendButton().disabled).toBe(true);
    expect(textarea.disabled).toBe(false);

    fireEvent.keyDown(textarea, { key: 'Enter' });
    fireEvent.click(sendButton());

    expect(onSend).not.toHaveBeenCalled();
    expect(useChatStore.getState().draftContent).toBe(
      'a draft written before the connection dropped',
    );
  });

  it('sends again once the reason clears', () => {
    const onSend = vi.fn(() => COMPOSER_SEND_ACCEPTED);
    const view = render(composer(onSend, OFFLINE));
    expect(sendButton().disabled).toBe(true);

    view.rerender(composer(onSend));

    expect(screen.queryByTestId('composer-send-blocked')).toBeNull();
    expect(sendButton().disabled).toBe(false);
    fireEvent.click(sendButton());
    expect(onSend).toHaveBeenCalledOnce();
  });
});
