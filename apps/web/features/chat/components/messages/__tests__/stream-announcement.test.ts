import { describe, expect, it } from 'vitest';

import { buildStreamAnnouncement } from '../ChatMessageList';
import type { ChatMessage } from '@agiworkforce/unified-chat';

function assistant(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'a1',
    role: 'assistant',
    content: 'Here is the answer.',
    timestamp: new Date(),
    ...overrides,
  } as ChatMessage;
}

describe('what the live region tells a screen reader when a turn ends', () => {
  it('reports a completed answer with its text', () => {
    expect(buildStreamAnnouncement(assistant())).toBe('Response complete. Here is the answer.');
  });

  it('does not claim completion when the turn produced no assistant message', () => {
    // A rate limit, a rejected request or a dropped connection leaves the
    // user's own message last. Announcing completion there describes a
    // response that was never written.
    const userTurn = { id: 'u1', role: 'user', content: 'Explain recursion' } as ChatMessage;
    expect(buildStreamAnnouncement(userTurn)).toBe('No response was generated');
    expect(buildStreamAnnouncement(undefined)).toBe('No response was generated');
  });

  it('reports a stopped turn as cancelled rather than complete', () => {
    const stopped = assistant({ metadata: { finishReason: 'stopped' } } as Partial<ChatMessage>);
    expect(buildStreamAnnouncement(stopped)).toBe('Response cancelled. Partial response saved.');
  });

  it('distinguishes a run where some tools failed from a clean one', () => {
    const partial = assistant({
      metadata: { agentActivity: { status: 'partial' } },
    } as Partial<ChatMessage>);
    expect(buildStreamAnnouncement(partial)).toBe('Response finished with errors');
  });

  it('says a turn holding an undecided approval is waiting, not complete', () => {
    const paused = assistant({
      metadata: {
        agentActivity: {
          status: 'paused',
          entries: [
            {
              kind: 'tool',
              id: 'tool:call-2',
              toolCallId: 'call-2',
              name: 'execute_code',
              status: 'awaiting-approval',
              approval: { id: 'approval-2' },
            },
          ],
        },
      },
    } as Partial<ChatMessage>);
    expect(buildStreamAnnouncement(paused)).toBe('Response paused, waiting for your approval');
  });

  it('reports a paused turn as paused even with no approval outstanding', () => {
    const paused = assistant({
      metadata: { agentActivity: { status: 'paused', entries: [] } },
    } as Partial<ChatMessage>);
    expect(buildStreamAnnouncement(paused)).toBe('Response paused');
  });

  it('does not report errors on a run whose last step recovered', () => {
    const recovered = assistant({
      metadata: {
        agentActivity: {
          status: 'partial',
          entries: [
            { kind: 'tool', id: 'tool:a', toolCallId: 'a', name: 'execute_code', status: 'failed' },
            {
              kind: 'tool',
              id: 'tool:b',
              toolCallId: 'b',
              name: 'execute_code',
              status: 'completed',
            },
          ],
        },
      },
    } as Partial<ChatMessage>);
    expect(buildStreamAnnouncement(recovered)).toBe('Response complete. Here is the answer.');
  });

  it('keeps reporting errors when the last step is the one that failed', () => {
    const stillBroken = assistant({
      metadata: {
        agentActivity: {
          status: 'partial',
          entries: [
            {
              kind: 'tool',
              id: 'tool:a',
              toolCallId: 'a',
              name: 'execute_code',
              status: 'completed',
            },
            { kind: 'tool', id: 'tool:b', toolCallId: 'b', name: 'execute_code', status: 'failed' },
          ],
        },
      },
    } as Partial<ChatMessage>);
    expect(buildStreamAnnouncement(stillBroken)).toBe('Response finished with errors');
  });

  it('reports an outright failure', () => {
    const failed = assistant({
      metadata: { agentActivity: { status: 'failed' } },
    } as Partial<ChatMessage>);
    expect(buildStreamAnnouncement(failed)).toBe('Response failed');
    expect(buildStreamAnnouncement(assistant({ error: 'upstream failed' }))).toBe(
      'Response failed',
    );
  });

  it('says partial content survived a cancellation', () => {
    const cancelled = assistant({
      metadata: { agentActivity: { status: 'cancelled' } },
    } as Partial<ChatMessage>);
    expect(buildStreamAnnouncement(cancelled)).toBe('Response cancelled. Partial response saved.');
    const empty = assistant({
      content: '',
      metadata: { agentActivity: { status: 'cancelled' } },
    } as Partial<ChatMessage>);
    expect(buildStreamAnnouncement(empty)).toBe('Response cancelled');
  });
});
