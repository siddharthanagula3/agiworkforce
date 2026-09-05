import { beforeEach, describe, expect, it } from 'vitest';
import { useChatStore } from '../web-chat-store';

beforeEach(() => {
  useChatStore.getState().reset();
});

describe('pendingTemporaryChat', () => {
  it('defaults to off', () => {
    expect(useChatStore.getState().pendingTemporaryChat).toBe(false);
  });

  it('arms and disarms from the composer toggle', () => {
    useChatStore.getState().setPendingTemporaryChat(true);
    expect(useChatStore.getState().pendingTemporaryChat).toBe(true);

    useChatStore.getState().setPendingTemporaryChat(false);
    expect(useChatStore.getState().pendingTemporaryChat).toBe(false);
  });

  it('survives returning to the empty new-chat surface', () => {
    useChatStore.getState().setPendingTemporaryChat(true);
    useChatStore.getState().setActiveConversation(null);

    expect(useChatStore.getState().pendingTemporaryChat).toBe(true);
  });

  it('is consumed once a real conversation becomes active', () => {
    useChatStore.getState().setPendingTemporaryChat(true);
    useChatStore.getState().setActiveConversation('conv-1');

    expect(useChatStore.getState().pendingTemporaryChat).toBe(false);
  });

  it('clears when switching to a different existing conversation', () => {
    useChatStore.getState().setActiveConversation('conv-1');
    useChatStore.getState().setPendingTemporaryChat(true);
    useChatStore.getState().setActiveConversation('conv-2');

    expect(useChatStore.getState().pendingTemporaryChat).toBe(false);
  });
});
