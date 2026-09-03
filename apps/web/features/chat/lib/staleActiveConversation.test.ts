import { describe, it, expect } from 'vitest';
import {
  isConversationListPending,
  isConversationRoutePending,
  isStaleActiveConversation,
} from './staleActiveConversation';

describe('isStaleActiveConversation', () => {
  const base = { isStreaming: false, isLoading: false };

  it('is true when the view is empty but a conversation is still active (the bug)', () => {
    expect(
      isStaleActiveConversation({
        ...base,
        displayedConversationId: null,
        activeConversationId: 'conv-abc',
      }),
    ).toBe(true);
  });

  it('is false on a genuinely fresh chat (nothing active), no needless reset', () => {
    expect(
      isStaleActiveConversation({
        ...base,
        displayedConversationId: null,
        activeConversationId: null,
      }),
    ).toBe(false);
  });

  it('is false while viewing a real conversation (ids match / non-empty view)', () => {
    expect(
      isStaleActiveConversation({
        ...base,
        displayedConversationId: 'conv-abc',
        activeConversationId: 'conv-abc',
      }),
    ).toBe(false);
  });

  it('never resets mid-send or mid-stream (race guard on the first-message flow)', () => {
    expect(
      isStaleActiveConversation({
        displayedConversationId: null,
        activeConversationId: 'conv-abc',
        isStreaming: true,
        isLoading: false,
      }),
    ).toBe(false);
    expect(
      isStaleActiveConversation({
        displayedConversationId: null,
        activeConversationId: 'conv-abc',
        isStreaming: false,
        isLoading: true,
      }),
    ).toBe(false);
  });

  it('never resets while a send is in flight, even in the createConversation→bareChatSessionId gap (DEMO-BLOCKER)', () => {
    expect(
      isStaleActiveConversation({
        displayedConversationId: null,
        activeConversationId: 'conv-abc',
        isStreaming: false,
        isLoading: false,
        isSending: true,
      }),
    ).toBe(false);
  });
});

describe('isConversationRoutePending', () => {
  it('covers the first-paint gap before auth and transcript loading begin', () => {
    expect(
      isConversationRoutePending({
        displayedConversationId: 'fixture-conversation',
        activeConversationId: null,
        displayedMessageCount: 0,
        authLoaded: false,
        isConversationLoading: false,
      }),
    ).toBe(true);
  });

  it('stops loading when a matching empty conversation has resolved', () => {
    expect(
      isConversationRoutePending({
        displayedConversationId: 'fixture-conversation',
        activeConversationId: 'fixture-conversation',
        displayedMessageCount: 0,
        authLoaded: true,
        isConversationLoading: false,
      }),
    ).toBe(false);
  });

  it('shows available transcript messages without waiting for the sidebar list fetch', () => {
    expect(
      isConversationRoutePending({
        displayedConversationId: 'fixture-conversation',
        activeConversationId: 'fixture-conversation',
        displayedMessageCount: 2,
        authLoaded: true,
        isConversationLoading: true,
      }),
    ).toBe(false);
  });
});

describe('isConversationListPending', () => {
  it('shows loading before auth can begin the first list fetch', () => {
    expect(
      isConversationListPending({
        authLoaded: false,
        isConversationLoading: false,
        conversationCount: 0,
      }),
    ).toBe(true);
  });

  it('keeps loaded conversation rows visible during later operations', () => {
    expect(
      isConversationListPending({
        authLoaded: true,
        isConversationLoading: true,
        conversationCount: 3,
      }),
    ).toBe(false);
  });
});
