import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ChatMessage } from '@agiworkforce/unified-chat';
import { ChatMessageList } from '../ChatMessageList';

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

function answeredTurn(): ChatMessage[] {
  return [
    {
      id: 'user-1',
      role: 'user',
      content: 'Why does the sky look blue?',
      createdAt: new Date(Date.now() - 120_000).toISOString(),
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Shorter wavelengths scatter more, so the sky reads blue from the ground.',
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      metadata: { truncated: true },
    },
  ] as unknown as ChatMessage[];
}

function renderTranscript(props: { messages: ChatMessage[]; turnErrorActive?: boolean }) {
  return render(
    <ChatMessageList
      messages={props.messages}
      onRegenerate={vi.fn()}
      onSendMessage={vi.fn()}
      enableFollowUpSuggestions
      turnErrorActive={props.turnErrorActive}
    />,
  );
}

describe('transcript turn-failure notice', () => {
  it('leaves the failed turn to the notice above the composer', () => {
    renderTranscript({ messages: trailingUserTurn(120_000), turnErrorActive: true });

    expect(screen.queryByText(GENERIC_NOTICE)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry this turn' })).toBeNull();
  });

  it('says nothing of its own once the grace period lapses', () => {
    renderTranscript({ messages: trailingUserTurn(120_000) });

    expect(screen.queryByText(GENERIC_NOTICE)).toBeNull();
  });

  it('offers follow-up questions on a turn no notice owns', () => {
    renderTranscript({ messages: answeredTurn() });

    expect(screen.queryByTestId('follow-up-suggestions-shell')).not.toBeNull();
  });

  it('offers no follow-up questions while the turn error notice is on screen', () => {
    renderTranscript({ messages: answeredTurn(), turnErrorActive: true });

    expect(screen.queryByTestId('follow-up-suggestions-shell')).toBeNull();
  });
});
