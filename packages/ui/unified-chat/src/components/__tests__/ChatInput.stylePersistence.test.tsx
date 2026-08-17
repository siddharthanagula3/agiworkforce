import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '../ChatInput';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';
import { WRITING_STYLE_STORAGE_KEY } from '../../lib/writingStyle';

function renderComposer() {
  const onSend = vi.fn();
  render(
    <ChatInput
      onSend={onSend}
      onStop={vi.fn()}
      onModelSelectorClick={vi.fn()}
      hasMessages={false}
      conversationId="conv-1"
    />,
  );
  return onSend;
}

function send(text: string) {
  const textarea = screen.getByRole('textbox');
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.keyDown(textarea, { key: 'Enter' });
}

describe('ChatInput writing-style persistence (UI-10)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useChatStore.setState({
      activeConversationId: 'conv-1',
      draftContent: '',
      draftsByConversation: {},
      isStreaming: false,
      conversations: [],
    });
    useModelStore.setState({ selectedModelId: 'auto-economy', models: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it('writes the chosen style somewhere a remount can read it', () => {
    renderComposer();

    fireEvent.click(screen.getByRole('button', { name: 'Add attachment' }));
    fireEvent.click(screen.getByText('Use style'));
    fireEvent.click(screen.getByText('Concise'));

    expect(window.localStorage.getItem(WRITING_STYLE_STORAGE_KEY)).toBe('concise');
  });

  it('still applies the stored style on a fresh mount instead of silently reverting', () => {
    window.localStorage.setItem(WRITING_STYLE_STORAGE_KEY, 'formal');

    const onSend = renderComposer();
    send('Draft the memo');

    expect(onSend).toHaveBeenCalled();
    expect(onSend.mock.calls[0]?.[5]).toBe('formal');
  });

  it('ignores a corrupted stored value rather than sending an unknown style', () => {
    window.localStorage.setItem(WRITING_STYLE_STORAGE_KEY, 'not-a-style');

    const onSend = renderComposer();
    send('Draft the memo');

    expect(onSend).toHaveBeenCalled();
    expect(onSend.mock.calls[0]?.[5]).toBeUndefined();
  });
});
