import { beforeEach, describe, expect, it } from 'vitest';
import { useThinkingStore } from './thinking-store';
import { PENDING_CONVERSATION_KEY } from './web-chat-store';

describe('reasoning preference scopes', () => {
  beforeEach(() => {
    useThinkingStore.setState({
      enabled: false,
      effort: 'medium',
      fast: false,
      byConversation: {},
    });
  });

  it('keeps a chat choice independent of the global default and other chats', () => {
    useThinkingStore.getState().setConversationEffort('chat-a', 'high');
    useThinkingStore.getState().setConversationEffort('chat-b', 'none');
    expect(useThinkingStore.getState()).toMatchObject({
      enabled: false,
      effort: 'medium',
      byConversation: {
        'chat-a': { enabled: true, effort: 'high' },
        'chat-b': { enabled: false, effort: 'none' },
      },
    });
    useThinkingStore.getState().setEffort('low');
    expect(useThinkingStore.getState().byConversation['chat-a']?.effort).toBe('high');
  });

  it('returns a chat to the global preference without changing the global setting', () => {
    useThinkingStore.getState().setConversationEffort('chat-a', 'high');
    useThinkingStore.getState().clearConversationPreference('chat-a');
    expect(useThinkingStore.getState().byConversation['chat-a']).toBeUndefined();
    expect(useThinkingStore.getState().enabled).toBe(false);
  });

  it('persists chat overrides across store rehydration', async () => {
    useThinkingStore.getState().setConversationEffort('chat-a', 'high');
    useThinkingStore.setState({ byConversation: {} });
    const persisted = JSON.parse(localStorage.getItem('agi-thinking-store') ?? '{}');
    persisted.state.byConversation = { 'chat-a': { enabled: true, effort: 'high' } };
    localStorage.setItem('agi-thinking-store', JSON.stringify(persisted));
    await useThinkingStore.persist.rehydrate();
    expect(useThinkingStore.getState().byConversation['chat-a']).toEqual({
      enabled: true,
      effort: 'high',
    });
  });

  it('adopts the latest placeholder choice after a slow conversation create without changing global defaults', () => {
    const state = useThinkingStore.getState();
    state.setConversationEffort(PENDING_CONVERSATION_KEY, 'none');
    state.setConversationEffort('other-chat', 'high');
    state.adoptConversationPreference(PENDING_CONVERSATION_KEY, 'client-placeholder');
    state.setConversationEffort('client-placeholder', 'low');
    state.adoptConversationPreference('client-placeholder', 'saved-chat');

    expect(useThinkingStore.getState()).toMatchObject({
      enabled: false,
      effort: 'medium',
      byConversation: {
        'saved-chat': { enabled: true, effort: 'low' },
        'other-chat': { enabled: true, effort: 'high' },
      },
    });
    expect(useThinkingStore.getState().byConversation[PENDING_CONVERSATION_KEY]).toBeUndefined();
    expect(useThinkingStore.getState().byConversation['client-placeholder']).toBeUndefined();
  });

  it('keeps a newer destination choice when placeholder adoption arrives late or repeats', () => {
    const state = useThinkingStore.getState();
    state.setConversationEffort('client-placeholder', 'low');
    state.setConversationEffort('saved-chat', 'high');
    state.adoptConversationPreference('client-placeholder', 'saved-chat');
    state.adoptConversationPreference('client-placeholder', 'saved-chat');
    state.adoptConversationPreference('saved-chat', 'saved-chat');

    expect(useThinkingStore.getState().byConversation['saved-chat']).toEqual({
      enabled: true,
      effort: 'high',
    });
    expect(useThinkingStore.getState().byConversation['client-placeholder']).toBeUndefined();
    expect(useThinkingStore.getState()).toMatchObject({ enabled: false, effort: 'medium' });
  });
});
