import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../lib/types';
import { useChatStore } from '../../stores/chatStore';
import { MessageList } from '../MessageList';

/**
 * DES-C04 — one omitted prop at the ChatInterface -> MessageList boundary
 * killed THREE affordances at once: the mid-stream-error Retry, the
 * per-message Retry in ActionBar, and the resend on an expired tool-approval
 * card. This pins the whole prop chain.
 */
const CONVERSATION_ID = 'conv-list-regenerate';

function seed(messages: ChatMessage[], streaming = false): void {
  useChatStore.setState({
    activeConversationId: CONVERSATION_ID,
    messagesByConversation: { [CONVERSATION_ID]: messages },
    isStreaming: streaming,
    streamingConversationIds: streaming ? { [CONVERSATION_ID]: true } : {},
  } as never);
}

const completedExchange: ChatMessage[] = [
  {
    id: 'user-1',
    role: 'user',
    content: 'Draft the launch note',
    timestamp: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Here is the note.',
    timestamp: '2026-08-01T00:00:01.000Z',
  },
];

describe('MessageList — regenerate prop chain (DES-C04)', () => {
  beforeEach(() => {
    // jsdom does not implement scrollIntoView; MessageList calls it on mount.
    Element.prototype.scrollIntoView = vi.fn();
    seed(completedExchange);
  });

  it('exposes a per-message Retry on a completed assistant turn', async () => {
    const onRegenerateMessage = vi.fn();
    render(
      <MessageList conversationId={CONVERSATION_ID} onRegenerateMessage={onRegenerateMessage} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRegenerateMessage).toHaveBeenCalledWith('assistant-1');
  });

  it('renders no Retry at all when the host wires no regenerate handler', () => {
    render(<MessageList conversationId={CONVERSATION_ID} />);

    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('wires the mid-stream-error notice Retry to the same handler', async () => {
    seed([
      completedExchange[0]!,
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Partial answer',
        timestamp: '2026-08-01T00:00:01.000Z',
        metadata: { finishReason: 'error', streamError: { message: 'Upstream reset' } },
      },
    ]);
    const onRegenerateMessage = vi.fn();
    render(
      <MessageList conversationId={CONVERSATION_ID} onRegenerateMessage={onRegenerateMessage} />,
    );

    const retries = screen.getAllByRole('button', { name: /Regenerate this response|Retry/ });
    expect(retries.length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Regenerate this response' }));
    expect(onRegenerateMessage).toHaveBeenCalledWith('assistant-1');
  });

  it('wires the expired tool-approval resend to the same handler', async () => {
    seed([
      completedExchange[0]!,
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        timestamp: '2026-08-01T00:00:01.000Z',
        toolCalls: [
          {
            id: 'call-1',
            name: 'write_file',
            args: { path: 'notes.md' },
            status: 'awaiting_approval',
            requiresApproval: true,
          },
        ],
      },
    ]);
    const onRegenerateMessage = vi.fn();
    render(
      <MessageList
        conversationId={CONVERSATION_ID}
        approvalTurnExpired
        onRegenerateMessage={onRegenerateMessage}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Resend' }));
    expect(onRegenerateMessage).toHaveBeenCalledWith('assistant-1');
  });
});
