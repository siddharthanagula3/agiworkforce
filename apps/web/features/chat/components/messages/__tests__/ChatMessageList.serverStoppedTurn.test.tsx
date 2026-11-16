import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ChatMessage } from '@agiworkforce/unified-chat';
import { ChatMessageList } from '../ChatMessageList';
import { resolveTurnErrorNotice } from '../../../lib/turn-error-notice';

const PARTIAL = 'Shorter wavelengths scatter more.';

function reloadedTurn(metadata: Record<string, unknown>): ChatMessage[] {
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
      content: PARTIAL,
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      metadata: {
        serverPersisted: true,
        requestId: 'request-1',
        truncated: true,
        truncationReason: 'stream_cancelled',
        ...metadata,
      },
    },
  ] as unknown as ChatMessage[];
}

function renderTranscript(messages: ChatMessage[]) {
  return render(
    <ChatMessageList
      messages={messages}
      onRegenerate={vi.fn()}
      onContinue={vi.fn()}
      conversationId="conversation-1"
    />,
  );
}

function noticeFor(messages: ChatMessage[]): string | null {
  return resolveTurnErrorNotice({
    lastMessage: messages.at(-1),
    isLoading: false,
    reportedTurnError: null,
    pastGracePeriod: true,
  });
}

describe('a reloaded turn the server recorded as stopped by the person', () => {
  it('shows the grey stopped notice with no Continue and no failure notice', () => {
    const messages = reloadedTurn({ finishReason: 'stopped' });
    renderTranscript(messages);

    expect(screen.getByText(/Response stopped\./i)).toBeTruthy();
    expect(screen.queryByText(/Continue generating/i)).toBeNull();
    expect(noticeFor(messages)).toBeNull();
  });

  it('keeps a turn cut off without a stop request apart from a stop', () => {
    const messages = reloadedTurn({});
    renderTranscript(messages);

    expect(screen.queryByText(/Response stopped\./i)).toBeNull();
    expect(noticeFor(messages)).not.toBeNull();
  });
});

type ReadonlyIdentityModule = typeof import('@/lib/identity/useSessionSnapshot');
vi.mock('@/lib/identity/useSessionSnapshot', async (original) => {
  const lifetime = { isCurrent: () => true };
  const capture = () => lifetime;
  return {
    ...(await original<ReadonlyIdentityModule>()),
    useReadonlyIdentityLifetime: () => capture,
    useSessionSnapshot: () => () => null,
  };
});
