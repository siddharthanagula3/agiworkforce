import { beforeEach, describe, expect, it } from 'vitest';
import { useChatStore, selectIsAgiWorkConversation } from '../web-chat-store';
import { toWebConversation } from '@/lib/hooks/useConversations';

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv-1',
    title: 'Pricing research',
    model: null,
    project_id: null,
    pinned: false,
    starred: false,
    archived: false,
    is_temporary: false,
    created_at: '2026-09-05T00:00:00.000Z',
    updated_at: '2026-09-05T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  useChatStore.setState({ conversations: [], workModeByConversation: {} });
});

// The badge has two sources: the server's derived mode, which survives a new
// device, and the persisted composer override, which exists from the first
// keystroke, before any run row does.
describe('is this conversation an AGI Work task', () => {
  it('carries the server derived mode onto the sidebar shape', () => {
    expect(toWebConversation(conversation({ work_mode: 'agiwork' })).workMode).toBe('agiwork');
    expect(toWebConversation(conversation()).workMode).toBeUndefined();
  });

  it('says yes from the durable mode alone', () => {
    useChatStore.setState({
      conversations: [toWebConversation(conversation({ work_mode: 'agiwork' }))],
    });

    expect(selectIsAgiWorkConversation('conv-1')(useChatStore.getState())).toBe(true);
  });

  it('says yes from the composer override before the first run exists', () => {
    useChatStore.setState({ workModeByConversation: { 'conv-1': 'agiwork' } });

    expect(selectIsAgiWorkConversation('conv-1')(useChatStore.getState())).toBe(true);
  });

  it('says no for a chat conversation, and for no conversation at all', () => {
    useChatStore.setState({
      conversations: [toWebConversation(conversation({ work_mode: 'chat' }))],
      workModeByConversation: { 'conv-1': 'chat' },
    });

    expect(selectIsAgiWorkConversation('conv-1')(useChatStore.getState())).toBe(false);
    expect(selectIsAgiWorkConversation(null)(useChatStore.getState())).toBe(false);
  });
});
