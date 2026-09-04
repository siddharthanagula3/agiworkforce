import { beforeEach, describe, expect, it } from 'vitest';
import {
  useChatStore,
  selectConversationMessages,
  selectIsActiveConversationStreaming,
  selectIsConversationLoading,
  selectIsConversationStreaming,
  PENDING_CONVERSATION_KEY,
} from './web-chat-store';

const conversationFixture = (id: string) => ({
  id,
  title: `Conversation ${id}`,
  model: null,
  projectId: null,
  isPinned: false,
  isStarred: false,
  isArchived: false,
  isTemporary: false,
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
});

describe('chatStore, paginated conversation identity', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('upserts a fully loaded deep-linked conversation that is absent from the sidebar page', () => {
    const deepLinked = conversationFixture('deep-linked');

    useChatStore.getState().upsertConversation(deepLinked);
    useChatStore.getState().upsertConversation({ ...deepLinked, title: 'Loaded detail' });

    expect(useChatStore.getState().conversations).toEqual([
      expect.objectContaining({ id: deepLinked.id, title: 'Loaded detail' }),
    ]);
  });

  it('preserves the active detailed row when a concurrent first sidebar page omits it', () => {
    const deepLinked = conversationFixture('deep-linked');
    const recent = conversationFixture('recent');

    useChatStore.getState().upsertConversation(deepLinked);
    useChatStore.getState().setActiveConversation(deepLinked.id);
    useChatStore.getState().setConversations([recent]);

    expect(useChatStore.getState().conversations.map(({ id }) => id)).toEqual([
      deepLinked.id,
      recent.id,
    ]);
  });
});

describe('chatStore, ambient managed search', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('enables Web search for every new managed conversation by default', () => {
    expect(useChatStore.getState().getComposerToggles('conv-new').webSearchEnabled).toBe(true);
  });

  it('drops the legacy persisted opt-out during the v3 migration', async () => {
    const migrate = useChatStore.persist.getOptions().migrate;
    expect(migrate).toBeDefined();

    const migrated = await migrate!(
      { webSearchByDefault: false, sidebarCollapsed: true } as never,
      2,
    );

    expect(migrated).toMatchObject({ sidebarCollapsed: true });
    expect(migrated).not.toHaveProperty('webSearchByDefault');
  });
});

describe('chatStore, new-conversation composer toggles', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('moves pending media mode onto the conversation created by the first send', () => {
    const { setComposerToggles, adoptPendingComposerToggles } = useChatStore.getState();

    setComposerToggles({ videoMode: true, imageMode: false }, null);
    adoptPendingComposerToggles('conv-created');

    expect(useChatStore.getState().getComposerToggles('conv-created')).toMatchObject({
      videoMode: true,
      imageMode: false,
    });
    expect(useChatStore.getState().getComposerToggles(null).videoMode).toBe(false);
  });

  it('does not overwrite a target conversation that already owns toggle state', () => {
    const { setComposerToggles, adoptPendingComposerToggles } = useChatStore.getState();

    setComposerToggles({ videoMode: true }, null);
    setComposerToggles({ imageMode: true, videoMode: false }, 'conv-existing');
    adoptPendingComposerToggles('conv-existing');

    expect(useChatStore.getState().getComposerToggles('conv-existing')).toMatchObject({
      imageMode: true,
      videoMode: false,
    });
  });
});

describe('chatStore, per-conversation work mode persistence', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('mirrors a direct mode switch on an existing conversation into the persisted map', () => {
    useChatStore.getState().setComposerToggles({ workMode: 'agiwork' }, 'conv-a');

    expect(useChatStore.getState().workModeByConversation['conv-a']).toBe('agiwork');
  });

  it('does not mirror a mode switch made on the pending, not-yet-created bucket', () => {
    useChatStore.getState().setComposerToggles({ workMode: 'agiwork' }, null);

    expect(useChatStore.getState().workModeByConversation).not.toHaveProperty(
      PENDING_CONVERSATION_KEY,
    );
  });

  it('mirrors the pending mode onto the conversation the first send created', () => {
    const { setComposerToggles, adoptPendingComposerToggles } = useChatStore.getState();

    setComposerToggles({ workMode: 'agiwork' }, null);
    adoptPendingComposerToggles('conv-created');

    expect(useChatStore.getState().workModeByConversation['conv-created']).toBe('agiwork');
  });

  it('survives a reload: getComposerToggles falls back to the persisted mode once the ephemeral bucket is gone', () => {
    const { setComposerToggles, adoptPendingComposerToggles } = useChatStore.getState();

    setComposerToggles({ workMode: 'agiwork' }, null);
    adoptPendingComposerToggles('conv-created');
    // A reload rehydrates only the persisted slice: composerTogglesByConversation
    // is not part of partialize, so it comes back empty, same as a fresh tab.
    useChatStore.setState({ composerTogglesByConversation: {} });

    expect(useChatStore.getState().getComposerToggles('conv-created').workMode).toBe('agiwork');
  });

  it('drops a deleted conversation persisted mode so a recreated id starts on Chat', () => {
    const { setComposerToggles, deleteConversation } = useChatStore.getState();

    setComposerToggles({ workMode: 'agiwork' }, 'conv-a');
    deleteConversation('conv-a');

    expect(useChatStore.getState().workModeByConversation).not.toHaveProperty('conv-a');
    expect(useChatStore.getState().getComposerToggles('conv-a').workMode).toBe('chat');
  });

  it('persists the per-conversation work mode, unlike the rest of composerTogglesByConversation', () => {
    const partialize = useChatStore.persist.getOptions().partialize;
    expect(partialize).toBeDefined();

    useChatStore.getState().setComposerToggles({ workMode: 'agiwork' }, 'conv-a');

    const persisted = partialize!(useChatStore.getState()) as {
      workModeByConversation?: Record<string, string>;
    };
    expect(persisted.workModeByConversation).toEqual({ 'conv-a': 'agiwork' });
  });

  it('seeds the ephemeral toggle bucket on rehydration, so the reactive composer selector also survives a reload', () => {
    const merge = useChatStore.persist.getOptions().merge;
    expect(merge).toBeDefined();

    const rehydrated = merge!(
      { workModeByConversation: { 'conv-a': 'agiwork' } },
      useChatStore.getState(),
    );

    expect(rehydrated.composerTogglesByConversation['conv-a']).toMatchObject({
      workMode: 'agiwork',
    });
  });

  it('does not overwrite an already-live ephemeral toggle bucket during rehydration', () => {
    const merge = useChatStore.persist.getOptions().merge;
    expect(merge).toBeDefined();

    useChatStore.getState().setComposerToggles({ workMode: 'chat', imageMode: true }, 'conv-a');
    const rehydrated = merge!(
      { workModeByConversation: { 'conv-a': 'agiwork' } },
      useChatStore.getState(),
    );

    expect(rehydrated.composerTogglesByConversation['conv-a']).toMatchObject({
      workMode: 'chat',
      imageMode: true,
    });
  });
});

describe('chatStore, per-conversation transcript scope', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it("keeps a background conversation's message updates out of the active transcript", () => {
    const { setActiveConversationWithMessages, updateMessage, setActiveConversation } =
      useChatStore.getState();
    const createdAt = '2026-07-25T00:00:00.000Z';

    setActiveConversationWithMessages('conv-a', [
      { id: 'assistant-1', role: 'assistant', content: 'A partial', createdAt },
    ]);
    setActiveConversationWithMessages('conv-b', [
      { id: 'assistant-1', role: 'assistant', content: 'B answer', createdAt },
    ]);

    updateMessage('assistant-1', { content: 'A complete' }, 'conv-a');

    const stateWhileBIsActive = useChatStore.getState();
    expect(stateWhileBIsActive.messages).toEqual([
      { id: 'assistant-1', role: 'assistant', content: 'B answer', createdAt },
    ]);
    expect(selectConversationMessages('conv-a')(stateWhileBIsActive)[0]?.content).toBe(
      'A complete',
    );
    expect(selectConversationMessages('conv-b')(stateWhileBIsActive)[0]?.content).toBe('B answer');

    setActiveConversation('conv-a');
    expect(useChatStore.getState().messages[0]?.content).toBe('A complete');
  });
});

describe('chatStore, per-conversation streaming scope', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('switching to a different conversation does not show it as falsely streaming', () => {
    const { startStreaming, setActiveConversationWithMessages } = useChatStore.getState();

    startStreaming('msg-a', 'conv-a');
    expect(selectIsActiveConversationStreaming(useChatStore.getState())).toBe(false);

    useChatStore.setState({ activeConversationId: 'conv-a' });
    expect(selectIsActiveConversationStreaming(useChatStore.getState())).toBe(true);

    setActiveConversationWithMessages('conv-b', []);
    expect(selectIsActiveConversationStreaming(useChatStore.getState())).toBe(false);
    expect(useChatStore.getState().isLoading).toBe(false);
    expect(useChatStore.getState().streamingConversationIds).toEqual(['conv-a']);
  });

  it("keys route UI to the URL conversation before the store's active id catches up", () => {
    const { startStreaming, setLoading } = useChatStore.getState();

    useChatStore.setState({ activeConversationId: 'conv-a' });
    startStreaming('msg-a', 'conv-a');
    setLoading(true, 'conv-a');

    const stateDuringRouteTransition = useChatStore.getState();
    expect(selectIsActiveConversationStreaming(stateDuringRouteTransition)).toBe(true);
    expect(selectIsConversationStreaming('conv-b')(stateDuringRouteTransition)).toBe(false);
    expect(selectIsConversationLoading('conv-b')(stateDuringRouteTransition)).toBe(false);
  });

  it("an orphaned background stream's completion does not wipe a genuinely-active new stream's flag", () => {
    const { startStreaming, stopStreaming, setLoading, setActiveConversationWithMessages } =
      useChatStore.getState();

    startStreaming('msg-a', 'conv-a');
    setLoading(true);
    setActiveConversationWithMessages('conv-b', []);
    startStreaming('msg-b', 'conv-b');
    setLoading(true);

    expect(selectIsActiveConversationStreaming(useChatStore.getState())).toBe(true);
    expect(useChatStore.getState().streamingConversationIds.sort()).toEqual(['conv-a', 'conv-b']);
    expect(useChatStore.getState().isLoading).toBe(true);

    stopStreaming('conv-a');
    setLoading(false, 'conv-a');

    expect(useChatStore.getState().streamingConversationIds).toEqual(['conv-b']);
    expect(selectIsActiveConversationStreaming(useChatStore.getState())).toBe(true);
    expect(useChatStore.getState().isLoading).toBe(true);
  });

  it('switching back to a conversation whose stream is still live re-shows it as streaming', () => {
    const { startStreaming, setActiveConversationWithMessages } = useChatStore.getState();

    startStreaming('msg-a', 'conv-a');
    setActiveConversationWithMessages('conv-b', []);
    expect(selectIsActiveConversationStreaming(useChatStore.getState())).toBe(false);

    setActiveConversationWithMessages('conv-a', []);
    expect(selectIsActiveConversationStreaming(useChatStore.getState())).toBe(true);
    expect(useChatStore.getState().isLoading).toBe(true);
  });

  it('user-initiated stop (no conversationId) targets only the active conversation', () => {
    const { startStreaming, stopStreaming, setActiveConversationWithMessages } =
      useChatStore.getState();

    startStreaming('msg-a', 'conv-a');
    setActiveConversationWithMessages('conv-b', []);
    startStreaming('msg-b', 'conv-b');

    stopStreaming();

    expect(useChatStore.getState().streamingConversationIds).toEqual(['conv-a']);
    expect(selectIsActiveConversationStreaming(useChatStore.getState())).toBe(false);
  });
});

describe('chatStore, per-conversation error scope', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('ignores a late error from a conversation after the user switches chats', () => {
    const { setActiveConversationWithMessages, setError } = useChatStore.getState();

    setActiveConversationWithMessages('conv-a', []);
    setError('Request failed: 504', 'conv-a');
    expect(useChatStore.getState().error).toBe('Request failed: 504');

    setActiveConversationWithMessages('conv-b', []);
    expect(useChatStore.getState().error).toBeNull();

    setError('Request failed: 504', 'conv-a');
    expect(useChatStore.getState().error).toBeNull();

    setError('B failed', 'conv-b');
    expect(useChatStore.getState().error).toBe('B failed');
  });
});

describe('chatStore, per-conversation connector opt-out', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('defaults to every connector enabled (empty disabled list)', () => {
    expect(useChatStore.getState().getDisabledConnectorIds('conv-a')).toEqual([]);
  });

  it('disables and re-enables a connector for one conversation without affecting another', () => {
    const { setConnectorEnabled, getDisabledConnectorIds } = useChatStore.getState();

    setConnectorEnabled('notion', false, 'conv-a');

    expect(getDisabledConnectorIds('conv-a')).toEqual(['notion']);
    expect(getDisabledConnectorIds('conv-b')).toEqual([]);

    setConnectorEnabled('notion', true, 'conv-a');
    expect(getDisabledConnectorIds('conv-a')).toEqual([]);
  });

  it('does not duplicate an entry when disabled twice', () => {
    const { setConnectorEnabled, getDisabledConnectorIds } = useChatStore.getState();

    setConnectorEnabled('notion', false, 'conv-a');
    setConnectorEnabled('notion', false, 'conv-a');

    expect(getDisabledConnectorIds('conv-a')).toEqual(['notion']);
  });

  it('moves the pending new-chat opt-out onto the conversation the first send created', () => {
    const { setConnectorEnabled, adoptPendingComposerToggles, getDisabledConnectorIds } =
      useChatStore.getState();

    setConnectorEnabled('notion', false, null);
    adoptPendingComposerToggles('conv-created');

    expect(getDisabledConnectorIds('conv-created')).toEqual(['notion']);
    expect(getDisabledConnectorIds(null)).toEqual([]);
  });

  it('does not overwrite a target conversation that already has its own opt-out set', () => {
    const { setConnectorEnabled, adoptPendingComposerToggles, getDisabledConnectorIds } =
      useChatStore.getState();

    setConnectorEnabled('notion', false, null);
    setConnectorEnabled('slack', false, 'conv-existing');
    adoptPendingComposerToggles('conv-existing');

    expect(getDisabledConnectorIds('conv-existing')).toEqual(['slack']);
  });

  it('drops a deleted conversation opt-out set so a recreated id starts clean', () => {
    const { setConnectorEnabled, getDisabledConnectorIds, deleteConversation } =
      useChatStore.getState();

    setConnectorEnabled('notion', false, 'conv-a');
    deleteConversation('conv-a');

    expect(getDisabledConnectorIds('conv-a')).toEqual([]);
  });

  it('persists the per-conversation opt-out set (unlike the other composer toggles)', () => {
    const partialize = useChatStore.persist.getOptions().partialize;
    expect(partialize).toBeDefined();

    useChatStore.getState().setConnectorEnabled('notion', false, 'conv-a');

    const persisted = partialize!(useChatStore.getState()) as {
      disabledConnectorIdsByConversation?: Record<string, string[]>;
    };
    expect(persisted.disabledConnectorIdsByConversation).toEqual({ 'conv-a': ['notion'] });
  });
});

describe('chatStore, per-conversation Memory opt-out', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('defaults to Memory enabled', () => {
    expect(useChatStore.getState().getMemoryEnabled('conv-a')).toBe(true);
  });

  it('disables and re-enables Memory for one conversation without affecting another', () => {
    const { setMemoryEnabled, getMemoryEnabled } = useChatStore.getState();

    setMemoryEnabled(false, 'conv-a');

    expect(getMemoryEnabled('conv-a')).toBe(false);
    expect(getMemoryEnabled('conv-b')).toBe(true);

    setMemoryEnabled(true, 'conv-a');
    expect(getMemoryEnabled('conv-a')).toBe(true);
  });

  it('moves the pending new-chat opt-out onto the conversation the first send created', () => {
    const { setMemoryEnabled, adoptPendingComposerToggles, getMemoryEnabled } =
      useChatStore.getState();

    setMemoryEnabled(false, null);
    adoptPendingComposerToggles('conv-created');

    expect(getMemoryEnabled('conv-created')).toBe(false);
    expect(getMemoryEnabled(null)).toBe(true);
  });

  it('does not overwrite a target conversation that already has its own Memory setting', () => {
    const { setMemoryEnabled, adoptPendingComposerToggles, getMemoryEnabled } =
      useChatStore.getState();

    setMemoryEnabled(false, null);
    setMemoryEnabled(true, 'conv-existing');
    adoptPendingComposerToggles('conv-existing');

    expect(getMemoryEnabled('conv-existing')).toBe(true);
  });

  it('drops a deleted conversation Memory opt-out so a recreated id starts clean', () => {
    const { setMemoryEnabled, getMemoryEnabled, deleteConversation } = useChatStore.getState();

    setMemoryEnabled(false, 'conv-a');
    deleteConversation('conv-a');

    expect(getMemoryEnabled('conv-a')).toBe(true);
  });

  it('persists the per-conversation Memory opt-out (unlike the other composer toggles)', () => {
    const partialize = useChatStore.persist.getOptions().partialize;
    expect(partialize).toBeDefined();

    useChatStore.getState().setMemoryEnabled(false, 'conv-a');

    const persisted = partialize!(useChatStore.getState()) as {
      memoryDisabledByConversation?: Record<string, boolean>;
    };
    expect(persisted.memoryDisabledByConversation).toEqual({ 'conv-a': true });
  });
});
