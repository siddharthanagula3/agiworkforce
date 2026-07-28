import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '../ChatInput';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';
import { useAgentControlStore } from '../../stores/agentControlStore';

function renderComposer(onSend = vi.fn(), supportsResearch = false) {
  render(
    <ChatInput
      onSend={onSend}
      onStop={vi.fn()}
      onModelSelectorClick={vi.fn()}
      hasMessages={false}
      conversationId="conv-1"
      supportsResearch={supportsResearch}
    />,
  );
  return { onSend, textarea: screen.getByRole('textbox') as HTMLTextAreaElement };
}

describe('ChatInput draft ownership', () => {
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

  it('keeps typed text in the canonical store and appends external context without sending', () => {
    const { onSend, textarea } = renderComposer();

    fireEvent.change(textarea, { target: { value: 'Keep my typed request' } });
    expect(useChatStore.getState().draftContent).toBe('Keep my typed request');

    act(() => {
      useChatStore.getState().appendDraftContent('Reviewed browser context');
    });

    expect(textarea.value).toBe('Keep my typed request\n\nReviewed browser context');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('uses the active-conversation streaming override instead of showing Stop for another chat', () => {
    useChatStore.setState({ isStreaming: true });

    render(
      <ChatInput
        onSend={vi.fn()}
        onStop={vi.fn()}
        onModelSelectorClick={vi.fn()}
        hasMessages={false}
        conversationId="conv-2"
        isStreamingOverride={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Send message (Enter)' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Stop generation' })).toBeNull();
  });

  it('does not carry an unsent draft into a newly selected conversation', () => {
    const { textarea } = renderComposer();
    fireEvent.change(textarea, { target: { value: 'Keep this draft in the old chat' } });

    act(() => {
      useChatStore.getState().setActiveConversation('conv-new');
    });

    expect(textarea.value).toBe('');
    expect(useChatStore.getState().draftsByConversation['conv-1']).toBe(
      'Keep this draft in the old chat',
    );
  });

  it('sends the store-owned draft and clears the originating composer', () => {
    const onSend = vi.fn();
    const { textarea } = renderComposer(onSend);
    fireEvent.change(textarea, { target: { value: 'Send this exact draft' } });

    fireEvent.click(screen.getByRole('button', { name: 'Send message (Enter)' }));

    expect(onSend).toHaveBeenCalledWith(
      'Send this exact draft',
      'ask',
      undefined,
      undefined,
      false,
    );
    expect(useChatStore.getState().draftContent).toBe('');
    expect(textarea.value).toBe('');
  });

  // Removed with Haiku 4.5 (retired 2026-07-27). It was the only catalog
  // model without an effort ladder, so 'hides the effort control' has no
  // model left to demonstrate it. Restore when one exists again.

  it('sends an attachment-only turn instead of enabling a silent no-op', () => {
    const onSend = vi.fn();
    renderComposer(onSend);
    const attachment = new File(['quarterly chart'], 'quarterly-chart.png', {
      type: 'image/png',
    });
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput!, { target: { files: [attachment] } });
    const thumbnail = screen.getByRole('img', { name: 'quarterly-chart.png' });
    expect(thumbnail.getAttribute('width')).toBe('20');
    expect(thumbnail.getAttribute('height')).toBe('20');
    fireEvent.click(screen.getByRole('button', { name: 'Send message (Enter)' }));

    expect(onSend).toHaveBeenCalledWith(
      'Please analyze the attached file.',
      'ask',
      undefined,
      [attachment],
      false,
    );
  });

  it('uses a typographic ellipsis in the reply placeholder', () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        onStop={vi.fn()}
        onModelSelectorClick={vi.fn()}
        hasMessages
        conversationId="conv-1"
      />,
    );

    expect(screen.getByRole('textbox').getAttribute('placeholder')).toBe('Reply…');
  });

  it('forwards an enabled Research request only when the active runtime supports it', () => {
    const onSend = vi.fn();
    const { textarea } = renderComposer(onSend, true);

    fireEvent.click(screen.getByRole('button', { name: 'Add attachment' }));
    fireEvent.click(screen.getByText('Research'));
    fireEvent.change(textarea, { target: { value: 'Investigate this thoroughly' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message (Enter)' }));

    expect(onSend).toHaveBeenCalledWith(
      'Investigate this thoroughly',
      'ask',
      undefined,
      undefined,
      true,
    );
  });

  it('clears a Research selection when the runtime loses that capability', () => {
    const onSend = vi.fn();
    const props = {
      onSend,
      onStop: vi.fn(),
      onModelSelectorClick: vi.fn(),
      hasMessages: false,
      conversationId: 'conv-1',
    };
    const { rerender } = render(<ChatInput {...props} supportsResearch />);

    fireEvent.click(screen.getByRole('button', { name: 'Add attachment' }));
    fireEvent.click(screen.getByText('Research'));
    rerender(<ChatInput {...props} supportsResearch={false} />);
    rerender(<ChatInput {...props} supportsResearch />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Investigate safely' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message (Enter)' }));

    expect(onSend).toHaveBeenCalledWith('Investigate safely', 'ask', undefined, undefined, false);
  });

  it('forwards the selected writing style instead of rendering a dead control', () => {
    const onSend = vi.fn();
    const { textarea } = renderComposer(onSend);

    fireEvent.click(screen.getByRole('button', { name: 'Add attachment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use style' }));
    fireEvent.click(screen.getByRole('button', { name: 'Formal' }));
    fireEvent.change(textarea, { target: { value: 'Draft the announcement' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message (Enter)' }));

    expect(onSend).toHaveBeenCalledWith(
      'Draft the announcement',
      'ask',
      undefined,
      undefined,
      false,
      'formal',
    );
  });
});
