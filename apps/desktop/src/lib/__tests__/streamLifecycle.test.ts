import { describe, expect, it } from 'vitest';
import type { EnhancedMessage } from '../../stores/chat/types';
import {
  resolveActiveStreamMessageId,
  buildCompletedStreamMessageUpdate,
  buildFailedStreamMessageUpdate,
  buildStreamingStateMessageUpdate,
  buildToolCallMessageUpdate,
  buildToolResultStateMessageUpdate,
  resolveTerminalStreamTarget,
} from '../streamLifecycle';

const createMessage = (
  overrides: Partial<EnhancedMessage> & Pick<EnhancedMessage, 'id' | 'role' | 'content'>,
): EnhancedMessage => ({
  timestamp: new Date('2026-03-12T00:00:00.000Z'),
  ...overrides,
});

describe('streamLifecycle', () => {
  it('prefers the resolved stream target when present', () => {
    const result = resolveTerminalStreamTarget({
      resolvedTargetId: 'resolved-message',
      currentStreamingMessageId: 'current-stream',
      currentMatchesSession: true,
      conversationMessages: [
        createMessage({
          id: 'assistant-1',
          role: 'assistant',
          content: 'Working',
          metadata: { streaming: true },
        }),
      ],
    });

    expect(result).toEqual({
      finalizedMessageId: 'resolved-message',
      hasValidTarget: true,
    });
  });

  it('falls back to the current streaming message when it matches the session', () => {
    const result = resolveTerminalStreamTarget({
      resolvedTargetId: null,
      currentStreamingMessageId: 'current-stream',
      currentMatchesSession: true,
      conversationMessages: [],
    });

    expect(result).toEqual({
      finalizedMessageId: 'current-stream',
      hasValidTarget: true,
    });
  });

  it('falls back to the latest streaming assistant when ids do not resolve', () => {
    const result = resolveTerminalStreamTarget({
      resolvedTargetId: null,
      currentStreamingMessageId: null,
      currentMatchesSession: false,
      conversationMessages: [
        createMessage({ id: 'assistant-1', role: 'assistant', content: 'Done' }),
        createMessage({
          id: 'assistant-2',
          role: 'assistant',
          content: 'Still streaming',
          metadata: { streaming: true },
        }),
      ],
    });

    expect(result).toEqual({
      finalizedMessageId: 'assistant-2',
      hasValidTarget: true,
    });
  });

  it('resolves active stream targets from session, payload, transcript, then global lookup', () => {
    const conversationMessages = [
      createMessage({
        id: 'assistant-streaming',
        role: 'assistant',
        content: 'Working',
        metadata: { streaming: true },
      }),
    ];

    expect(
      resolveActiveStreamMessageId(
        {
          messages: conversationMessages,
        },
        {
          conversationMessages,
          sessionMessageId: 'assistant-streaming',
          payloadMessageId: 'payload-message',
          currentStreamingMessageId: 'current-stream',
        },
      ),
    ).toBe('assistant-streaming');

    expect(
      resolveActiveStreamMessageId(
        {
          messages: [
            createMessage({
              id: 'payload-message',
              role: 'assistant',
              content: 'Global fallback',
            }),
          ],
        },
        {
          conversationMessages: [],
          sessionMessageId: null,
          payloadMessageId: 'payload-message',
          currentStreamingMessageId: null,
        },
      ),
    ).toBe('payload-message');
  });

  it('builds a completed stream message update with normalized cost', () => {
    expect(
      buildCompletedStreamMessageUpdate({
        totalTokens: 42,
        costCents: 125,
      }),
    ).toEqual({
      metadata: {
        streaming: false,
        tokenCount: 42,
        cost: 1.25,
      },
    });
  });

  it('builds a failed stream message update with visible and raw errors separated', () => {
    expect(
      buildFailedStreamMessageUpdate({
        displayError: 'Friendly: timeout',
        rawError: 'timeout',
      }),
    ).toEqual({
      content: 'Friendly: timeout',
      metadata: {
        streaming: false,
      },
      error: 'timeout',
    });
  });

  it('builds a generic streaming state update for progress/status patches', () => {
    expect(
      buildStreamingStateMessageUpdate({
        streaming: true,
        status: 'tool_progress',
        label: 'Processing image...',
      }),
    ).toEqual({
      metadata: {
        streaming: true,
        status: 'tool_progress',
        label: 'Processing image...',
      },
    });
  });

  it('builds a tool-call message update for inline tool card activation', () => {
    expect(
      buildToolCallMessageUpdate({
        toolName: 'filesystem.search',
        toolCallId: 'tool-1',
      }),
    ).toEqual({
      metadata: {
        tool: 'filesystem.search',
        tool_call: 'tool-1',
        actionId: 'tool-1',
        name: 'filesystem.search',
        status: 'running',
        streaming: true,
      },
    });
  });

  it('builds a tool-result state update for final tool card status', () => {
    expect(buildToolResultStateMessageUpdate({ success: true })).toEqual({
      metadata: {
        status: 'completed',
        streaming: false,
      },
    });
  });
});
