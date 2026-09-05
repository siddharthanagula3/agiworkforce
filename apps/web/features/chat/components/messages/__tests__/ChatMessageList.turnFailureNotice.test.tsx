import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ChatMessage } from '@agiworkforce/unified-chat';
import { ChatMessageList } from '../ChatMessageList';

const SEND_FAILURE = 'Could not start the conversation.';
const GENERIC_NOTICE = /returned no response for this turn/i;

function trailingUserTurn(ageMs: number): ChatMessage[] {
  return [
    {
      id: 'user-1',
      role: 'user',
      content: 'Reply with two short sentences about why the sky looks blue.',
      createdAt: new Date(Date.now() - ageMs).toISOString(),
    },
  ] as unknown as ChatMessage[];
}

function renderTranscript(props: { messages: ChatMessage[]; turnError?: string | null }) {
  return render(
    <ChatMessageList
      messages={props.messages}
      onRegenerate={vi.fn()}
      turnError={props.turnError}
    />,
  );
}

describe('transcript turn-failure notice', () => {
  it('states the send failure inline as soon as the turn fails', () => {
    renderTranscript({ messages: trailingUserTurn(0), turnError: SEND_FAILURE });

    expect(screen.getByText(SEND_FAILURE)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Retry this turn' })).not.toBeNull();
  });

  it('carries exactly one failure notice for one failed send', () => {
    renderTranscript({ messages: trailingUserTurn(0), turnError: SEND_FAILURE });

    expect(screen.queryAllByText(SEND_FAILURE)).toHaveLength(1);
    expect(screen.queryByText(GENERIC_NOTICE)).toBeNull();
  });

  it('stays quiet while a fresh turn is still within the grace period', () => {
    renderTranscript({ messages: trailingUserTurn(0) });

    expect(screen.queryByText(GENERIC_NOTICE)).toBeNull();
  });

  it('falls back to the generic incomplete-turn copy once the grace period lapses', () => {
    renderTranscript({ messages: trailingUserTurn(120_000) });

    expect(screen.getByText(GENERIC_NOTICE)).not.toBeNull();
  });
});
