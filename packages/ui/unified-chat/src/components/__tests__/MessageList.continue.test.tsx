import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MessageList } from '../MessageList';
import { useChatStore } from '../../stores/chatStore';
import type { ChatMessage } from '../../lib/types';

const CONTINUE_NAME = /continue generating/i;

const continuable: ChatMessage = {
  id: 'a1',
  role: 'assistant',
  content: 'partial answer that got cut off',
  createdAt: '2026-05-06T12:00:00.000Z',
  metadata: { finishReason: 'length' },
};

function seed(messages: ChatMessage[], isStreaming = false) {
  useChatStore.setState({ messagesByConversation: { c1: messages }, isStreaming } as never);
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  useChatStore.setState({ messagesByConversation: {}, isStreaming: false } as never);
});

afterEach(() => cleanup());

describe('MessageList Continue Generation control', () => {
  it('offers Continue for a continuable last assistant turn and calls the handler with its id', () => {
    seed([continuable]);
    const onContinue = vi.fn();
    render(
      <MessageList
        conversationId="c1"
        onContinueGeneration={onContinue}
        showProvenanceFooter={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: CONTINUE_NAME }));
    expect(onContinue).toHaveBeenCalledWith('a1');
  });

  it('does NOT offer Continue on a normally-completed turn', () => {
    // The shared fixture's content is "partial answer that got cut off", which
    // is what a truncation check exists to catch. A turn that is genuinely
    // finished needs a finished answer to stand on.
    seed([
      {
        ...continuable,
        content: 'That covers everything you asked about.',
        metadata: { finishReason: 'stop' },
      },
    ]);
    render(
      <MessageList
        conversationId="c1"
        onContinueGeneration={vi.fn()}
        showProvenanceFooter={false}
      />,
    );
    expect(screen.queryByRole('button', { name: CONTINUE_NAME })).toBeNull();
  });

  it('does NOT offer Continue when no handler is wired (unsupported/local runtime)', () => {
    seed([continuable]);
    render(<MessageList conversationId="c1" showProvenanceFooter={false} />);
    expect(screen.queryByRole('button', { name: CONTINUE_NAME })).toBeNull();
  });

  it('does NOT offer Continue while a stream is in flight', () => {
    seed([continuable], true);
    render(
      <MessageList
        conversationId="c1"
        onContinueGeneration={vi.fn()}
        showProvenanceFooter={false}
      />,
    );
    expect(screen.queryByRole('button', { name: CONTINUE_NAME })).toBeNull();
  });

  it('does NOT offer Continue when the continuable turn is not the last message', () => {
    seed([
      continuable,
      { id: 'u2', role: 'user', content: 'follow up', createdAt: '2026-05-06T12:01:00.000Z' },
    ]);
    render(
      <MessageList
        conversationId="c1"
        onContinueGeneration={vi.fn()}
        showProvenanceFooter={false}
      />,
    );
    expect(screen.queryByRole('button', { name: CONTINUE_NAME })).toBeNull();
  });
});
