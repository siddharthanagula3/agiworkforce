import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '../ChatInput';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';
import { LARGE_PASTE_THRESHOLD } from '../../lib/largePaste';

function pasteText(target: HTMLElement, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { items: [], getData: (type: string) => (type === 'text/plain' ? text : '') },
  });
  fireEvent(target, event);
  return event;
}

function renderComposer() {
  render(
    <ChatInput
      onSend={vi.fn()}
      onStop={vi.fn()}
      onModelSelectorClick={vi.fn()}
      hasMessages={false}
      conversationId="conv-1"
    />,
  );
  return screen.getByRole('textbox') as HTMLTextAreaElement;
}

describe('ChatInput large-paste handling (COMPOSER-002)', () => {
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

  afterEach(() => {
    cleanup();
  });

  it('converts a book-sized paste into a "Pasted text" attachment instead of flooding the textarea', () => {
    const textarea = renderComposer();

    const event = pasteText(textarea, 'x'.repeat(LARGE_PASTE_THRESHOLD));

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByText('Pasted text.txt')).not.toBeNull();
    expect(useChatStore.getState().draftContent).toBe('');
  });

  it('names each further large paste distinctly so one attachment never hides another', () => {
    const textarea = renderComposer();

    pasteText(textarea, 'a'.repeat(LARGE_PASTE_THRESHOLD));
    pasteText(textarea, 'b'.repeat(LARGE_PASTE_THRESHOLD));

    expect(screen.getByText('Pasted text.txt')).not.toBeNull();
    expect(screen.getByText('Pasted text 2.txt')).not.toBeNull();
  });

  it('leaves an ordinary paste alone so short text still types into the composer', () => {
    const textarea = renderComposer();

    const event = pasteText(textarea, 'y'.repeat(LARGE_PASTE_THRESHOLD - 1));

    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByText('Pasted text.txt')).toBeNull();
  });
});
