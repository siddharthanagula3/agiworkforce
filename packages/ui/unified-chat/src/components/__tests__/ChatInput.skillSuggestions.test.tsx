import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput, type ChatInputProps } from '../ChatInput';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';

function renderComposer(overrides: Partial<ChatInputProps> = {}) {
  const onSend = vi.fn();
  render(
    <ChatInput
      onSend={onSend}
      onStop={vi.fn()}
      onModelSelectorClick={vi.fn()}
      hasMessages={false}
      conversationId="conv-1"
      {...overrides}
    />,
  );
  return { onSend, textarea: screen.getByRole('textbox') as HTMLTextAreaElement };
}

const matchedSkill = {
  name: 'invoice-reconciler',
  description: 'Reconciles vendor invoices against ledger entries',
  reason: 'Keywords matched: invoice, ledger',
};

describe('ChatInput automatic skill suggestions', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useChatStore.setState({
      activeConversationId: 'conv-1',
      draftContent: '',
      draftsByConversation: {},
      isStreaming: false,
    });
    useModelStore.setState({ selectedModelId: 'auto-economy' });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  async function typeAndSettle(textarea: HTMLTextAreaElement, value: string) {
    fireEvent.change(textarea, { target: { value } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
  }

  it('offers relevance-matched skills for a typed draft without any explicit selection', async () => {
    const suggestSkills = vi.fn().mockResolvedValue([matchedSkill]);
    const { textarea } = renderComposer({ suggestSkills });

    await typeAndSettle(textarea, 'Reconcile the vendor invoice against the ledger');

    expect(suggestSkills).toHaveBeenCalledWith('Reconcile the vendor invoice against the ledger');
    await waitFor(() => {
      expect(screen.getByTestId('composer-skill-suggestions')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Use invoice-reconciler skill' })).toBeTruthy();
  });

  it('sends the accepted suggestion as the skill name on the next message', async () => {
    const suggestSkills = vi.fn().mockResolvedValue([matchedSkill]);
    const { onSend, textarea } = renderComposer({ suggestSkills });

    await typeAndSettle(textarea, 'Reconcile the vendor invoice against the ledger');
    fireEvent.click(await screen.findByRole('button', { name: 'Use invoice-reconciler skill' }));
    fireEvent.click(screen.getByRole('button', { name: /Send message/ }));

    expect(onSend.mock.calls[0]?.[7]).toBe('invoice-reconciler');
  });

  it('keeps a dismissed suggestion hidden while the draft stays the same', async () => {
    const suggestSkills = vi.fn().mockResolvedValue([matchedSkill]);
    const { textarea } = renderComposer({ suggestSkills });

    await typeAndSettle(textarea, 'Reconcile the vendor invoice against the ledger');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Dismiss invoice-reconciler suggestion' }),
    );

    await waitFor(() => {
      expect(screen.queryByTestId('composer-skill-suggestions')).toBeNull();
    });
  });

  it('does not ask the host for matches on a draft too short to be a request', async () => {
    const suggestSkills = vi.fn().mockResolvedValue([matchedSkill]);
    const { textarea } = renderComposer({ suggestSkills });

    await typeAndSettle(textarea, 'hi');

    expect(suggestSkills).not.toHaveBeenCalled();
    expect(screen.queryByTestId('composer-skill-suggestions')).toBeNull();
  });
});
