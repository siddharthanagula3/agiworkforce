import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPOSER_SEND_ACCEPTED, ChatInput, type ChatInputProps } from '../ChatInput';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';
import { useSettingsStore } from '../../stores/settingsStore';

function renderComposer(acceptsFollowUps: boolean) {
  const onSend = vi.fn((..._args: Parameters<ChatInputProps['onSend']>) => COMPOSER_SEND_ACCEPTED);
  const onFollowUpInvert = vi.fn();
  render(
    <ChatInput
      onSend={onSend}
      onStop={vi.fn()}
      onModelSelectorClick={vi.fn()}
      hasMessages
      conversationId="conv-1"
      supportsResearch={false}
      acceptsFollowUps={acceptsFollowUps}
      canSteerFollowUps
      onFollowUpInvert={onFollowUpInvert}
    />,
  );
  return { onSend, onFollowUpInvert, textarea: screen.getByRole('textbox') as HTMLTextAreaElement };
}

describe('ChatInput follow-ups while a reply is running', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: 'conv-1',
      draftContent: '',
      draftsByConversation: {},
      isStreaming: true,
      conversations: [],
    });
    useModelStore.setState({ selectedModelId: 'auto-economy', models: [] });
    useSettingsStore.setState({ followUpQueueMode: 'steer' });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('refuses a send mid-reply when the host takes no follow-ups', () => {
    const { onSend, textarea } = renderComposer(false);

    fireEvent.change(textarea, { target: { value: 'one more thing' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('hands a mid-reply send to the host as a follow-up', () => {
    const { onSend, onFollowUpInvert, textarea } = renderComposer(true);

    fireEvent.change(textarea, { target: { value: 'one more thing' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend.mock.calls[0]?.[0]).toBe('one more thing');
    expect(onFollowUpInvert).not.toHaveBeenCalled();
  });

  it.each([
    ['MacIntel', { metaKey: true }],
    ['Win32', { ctrlKey: true }],
  ])('marks the platform modifier+Shift+Enter as the inverted follow-up on %s', (platform, mod) => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
    const { onSend, onFollowUpInvert, textarea } = renderComposer(true);

    fireEvent.change(textarea, { target: { value: 'later please' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true, ...mod });

    expect(onFollowUpInvert).toHaveBeenCalledOnce();
    expect(onSend).toHaveBeenCalledOnce();
  });

  it('shows the queue button instead of Stop once there is a queued-mode draft', () => {
    useSettingsStore.setState({ followUpQueueMode: 'queue' });
    const { textarea } = renderComposer(true);

    fireEvent.change(textarea, { target: { value: 'next' } });

    expect(screen.getByRole('button', { name: 'Add message to queue' })).toBeTruthy();
  });
});
