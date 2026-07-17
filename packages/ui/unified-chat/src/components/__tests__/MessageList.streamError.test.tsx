/**
 * MessageList — mid-stream provider error notice.
 *
 * Pins the affordance gate: the incomplete-response notice is shown ONLY for
 * a last assistant message carrying metadata.streamError (additive
 * x_stream_error delta — see hasStreamError's doc comment), only once
 * streaming has stopped, and is mutually exclusive with Continue Generation.
 * The Retry button only renders when the host wired onRegenerateMessage — no
 * fake affordance (mirrors MessageList.continue.test.tsx's Continue gate).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MessageList } from '../MessageList';
import { useChatStore } from '../../stores/chatStore';
import type { ChatMessage } from '../../lib/types';

// Matches both the fallback copy ("This response may be incomplete — ...")
// and the enriched copy ("Response may be incomplete: <classified message>").
const NOTICE_TEXT = /response may be incomplete/i;
const RETRY_NAME = /regenerate this response/i;

const failedMidStream: ChatMessage = {
  id: 'a1',
  role: 'assistant',
  content: 'partial answer before the connection dropped',
  createdAt: '2026-05-06T12:00:00.000Z',
  metadata: { streamError: 'Anthropic API overloaded' },
};

function seed(messages: ChatMessage[], isStreaming = false) {
  useChatStore.setState({ messagesByConversation: { c1: messages }, isStreaming } as never);
}

beforeEach(() => {
  // jsdom does not implement scrollIntoView; MessageList calls it on mount.
  Element.prototype.scrollIntoView = vi.fn();
  useChatStore.setState({ messagesByConversation: {}, isStreaming: false } as never);
});

afterEach(() => cleanup());

describe('MessageList mid-stream error notice', () => {
  it('shows the notice for a last assistant message with metadata.streamError', () => {
    seed([failedMidStream]);
    render(<MessageList conversationId="c1" showProvenanceFooter={false} />);
    expect(screen.getByText(NOTICE_TEXT)).toBeTruthy();
    // The partial content is preserved, never replaced by the notice.
    expect(screen.getByText('partial answer before the connection dropped')).toBeTruthy();
  });

  it('does NOT show a Retry button when onRegenerateMessage is not wired (no fake affordance)', () => {
    seed([failedMidStream]);
    render(<MessageList conversationId="c1" showProvenanceFooter={false} />);
    expect(screen.getByText(NOTICE_TEXT)).toBeTruthy();
    expect(screen.queryByRole('button', { name: RETRY_NAME })).toBeNull();
  });

  it('shows Retry and calls the handler with the message id when onRegenerateMessage is wired', () => {
    seed([failedMidStream]);
    const onRegenerate = vi.fn();
    render(
      <MessageList
        conversationId="c1"
        onRegenerateMessage={onRegenerate}
        showProvenanceFooter={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: RETRY_NAME }));
    expect(onRegenerate).toHaveBeenCalledWith('a1');
  });

  it('does NOT show the notice on a normally-completed turn (no streamError)', () => {
    seed([{ ...failedMidStream, metadata: { finishReason: 'stop' } }]);
    render(<MessageList conversationId="c1" showProvenanceFooter={false} />);
    expect(screen.queryByText(NOTICE_TEXT)).toBeNull();
  });

  it('does NOT show the notice while a stream is in flight', () => {
    seed([failedMidStream], true);
    render(<MessageList conversationId="c1" showProvenanceFooter={false} />);
    expect(screen.queryByText(NOTICE_TEXT)).toBeNull();
  });

  it('does NOT show the notice when the failed turn is not the last message', () => {
    seed([
      failedMidStream,
      { id: 'u2', role: 'user', content: 'follow up', createdAt: '2026-05-06T12:01:00.000Z' },
    ]);
    render(<MessageList conversationId="c1" showProvenanceFooter={false} />);
    expect(screen.queryByText(NOTICE_TEXT)).toBeNull();
  });

  it('is mutually exclusive with Continue Generation', () => {
    // A turn with BOTH a continuable finishReason and a streamError shouldn't
    // realistically happen (see hasStreamError's doc comment), but the
    // notice must not double up with Continue if it ever does.
    seed([{ ...failedMidStream, metadata: { finishReason: 'length', streamError: 'boom' } }]);
    render(
      <MessageList
        conversationId="c1"
        onContinueGeneration={vi.fn()}
        onRegenerateMessage={vi.fn()}
        showProvenanceFooter={false}
      />,
    );
    expect(screen.getByRole('button', { name: /continue generating/i })).toBeTruthy();
    expect(screen.queryByText(NOTICE_TEXT)).toBeNull();
  });
});
