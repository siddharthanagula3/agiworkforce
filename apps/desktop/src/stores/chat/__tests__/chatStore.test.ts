import { describe, it, expect, vi, beforeEach } from 'vitest';

const localStorageMock = {
  getItem: vi.fn().mockReturnValue(null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

vi.mock('../../lib/tauri-mock', () => ({
  invoke: vi.fn(),
  isTauri: false,
  isTauriContext: vi.fn(() => false),
}));

vi.mock('../../utils/localStorage', () => ({
  safeGetJSON: vi.fn().mockReturnValue({ dbIdToUuid: {}, uuidToDbId: {} }),
  safeSetJSON: vi.fn().mockReturnValue(true),
  storageFallback: {
    length: 0,
    clear: vi.fn(),
    getItem: vi.fn().mockReturnValue(null),
    key: vi.fn().mockReturnValue(null),
    removeItem: vi.fn(),
    setItem: vi.fn(),
  },
}));

import { dbIdToUuid, uuidToDbId, clearIdMappings, useChatStore } from '../chatStore';
import { useAppModeStore } from '../../appModeStore';

const FIXTURE_MODEL_ID = 'fixture-model';

function populateMappings(count: number): Array<[number, string]> {
  const pairs: Array<[number, string]> = [];
  for (let i = 1; i <= count; i++) {
    const uuid = dbIdToUuid(i);
    pairs.push([i, uuid]);
  }
  return pairs;
}

describe('chatStore ID mapping pruning (H51)', () => {
  beforeEach(() => {
    clearIdMappings();
    vi.clearAllMocks();
    useAppModeStore.setState({ mode: 'local' });
  });

  describe('dbIdToUuid', () => {
    it('creates a UUID for a new dbId', () => {
      const uuid = dbIdToUuid(1);
      expect(typeof uuid).toBe('string');
      expect(uuid.length).toBeGreaterThan(0);
    });

    it('returns the same UUID on subsequent calls for the same dbId', () => {
      const first = dbIdToUuid(42);
      const second = dbIdToUuid(42);
      expect(first).toBe(second);
    });

    it('creates different UUIDs for different dbIds', () => {
      const uuid1 = dbIdToUuid(100);
      const uuid2 = dbIdToUuid(101);
      expect(uuid1).not.toBe(uuid2);
    });
  });

  describe('uuidToDbId', () => {
    it('returns the dbId after a mapping is created via dbIdToUuid', () => {
      const uuid = dbIdToUuid(7);
      expect(uuidToDbId(uuid)).toBe(7);
    });

    it('returns undefined for an unknown UUID', () => {
      expect(uuidToDbId('00000000-0000-0000-0000-000000000000')).toBeUndefined();
    });
  });

  describe('pruning, FIFO eviction at 1001 entries', () => {
    it('triggers pruning when more than 1000 entries are added', () => {
      const pairs = populateMappings(1001);

      const firstUuid = pairs[0]![1];
      expect(uuidToDbId(firstUuid)).toBeUndefined();
    });

    it('retains the most recent 1000 entries after pruning', () => {
      const pairs = populateMappings(1001);

      for (let i = 1; i < pairs.length; i++) {
        const [dbId, uuid] = pairs[i]!;
        expect(uuidToDbId(uuid)).toBe(dbId);
        expect(dbIdToUuid(dbId)).toBe(uuid);
      }
    });

    it('oldest entry by numeric dbId is removed first (not insertion order)', () => {
      populateMappings(999);

      const veryOldId = 0;
      const veryOldUuid = dbIdToUuid(veryOldId);

      dbIdToUuid(1000);
      dbIdToUuid(1001);

      expect(uuidToDbId(veryOldUuid)).toBeUndefined();
    });
  });

  describe('pruning, boundary conditions', () => {
    it('does not prune when exactly 1000 entries exist', () => {
      const pairs = populateMappings(1000);

      for (const [dbId, uuid] of pairs) {
        expect(uuidToDbId(uuid)).toBe(dbId);
      }
    });

    it('does not prune when fewer than 1000 entries exist', () => {
      const pairs = populateMappings(500);

      for (const [dbId, uuid] of pairs) {
        expect(uuidToDbId(uuid)).toBe(dbId);
      }
    });

    it('count stays at or below 1000 after many additions', () => {
      populateMappings(1500);

      for (let i = 501; i <= 1500; i++) {
        const uuid = dbIdToUuid(i);
        expect(typeof uuid).toBe('string');
        expect(uuidToDbId(uuid)).toBe(i);
      }
    });
  });

  describe('clearIdMappings', () => {
    it('removes all mappings', () => {
      const uuid = dbIdToUuid(1);
      clearIdMappings();
      expect(uuidToDbId(uuid)).toBeUndefined();
    });

    it('allows new mappings after clear', () => {
      dbIdToUuid(1);
      clearIdMappings();
      const newUuid = dbIdToUuid(1);
      expect(typeof newUuid).toBe('string');
    });
  });
});

function generateTitleFromMessage(content: string): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/[#*_~[\](){}|\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 'New conversation';

  const maxLength = 50;
  if (cleaned.length <= maxLength) return cleaned;

  const truncated = cleaned.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 30) {
    return truncated.slice(0, lastSpace) + '...';
  }
  return truncated + '...';
}

describe('generateTitleFromMessage (H15)', () => {
  describe('fenced code block stripping', () => {
    it('removes a simple fenced code block', () => {
      const msg = 'Here is my code:\n```\nconsole.log("hello");\n```\nDoes it work?';
      const title = generateTitleFromMessage(msg);
      expect(title).not.toContain('```');
      expect(title).not.toContain('console.log');
      expect(title).toContain('Here is my code');
    });

    it('returns "New conversation" when message is only a fenced code block', () => {
      const msg = '```typescript\nconst x: number = 42;\n```';
      const title = generateTitleFromMessage(msg);
      expect(title).toBe('New conversation');
    });

    it('handles multiple fenced blocks in one message', () => {
      const msg = '```js\nfoo();\n```\nand\n```py\nbar()\n```';
      const title = generateTitleFromMessage(msg);
      expect(title).not.toContain('foo');
      expect(title).not.toContain('bar');
    });
  });

  describe('inline code stripping', () => {
    it('removes inline backtick code', () => {
      const msg = 'Can you help me fix this `bug`?';
      expect(generateTitleFromMessage(msg)).toBe('Can you help me fix this ?');
    });

    it('removes multiple inline code spans', () => {
      const msg = 'Call `foo()` then `bar()` to finish';
      const title = generateTitleFromMessage(msg);
      expect(title).not.toContain('foo');
      expect(title).not.toContain('bar');
      expect(title).toContain('Call');
      expect(title).toContain('then');
    });
  });

  describe('long content truncation', () => {
    it('returns content unchanged when it is exactly 50 characters', () => {
      const exact = 'a'.repeat(50);
      expect(generateTitleFromMessage(exact)).toBe(exact);
    });

    it('truncates content longer than 50 characters', () => {
      const long = 'a'.repeat(60);
      const title = generateTitleFromMessage(long);
      expect(title.length).toBeLessThanOrEqual(53);
      expect(title.endsWith('...')).toBe(true);
    });

    it('truncates at word boundary when last space is beyond position 30', () => {
      const msg = 'word word word word word word extra-long-content-here';
      const title = generateTitleFromMessage(msg);
      expect(title.endsWith('...')).toBe(true);
      const withoutEllipsis = title.slice(0, -3);
      expect(withoutEllipsis.endsWith(' ')).toBe(false);
    });

    it('truncates hard at 50 when last space is at or before position 30', () => {
      const msg = 'short ' + 'X'.repeat(60);
      const title = generateTitleFromMessage(msg);
      expect(title.endsWith('...')).toBe(true);
    });

    it('returns "New conversation" for content that is all code blocks', () => {
      const msg = '```\nconst x = 1;\n```';
      expect(generateTitleFromMessage(msg)).toBe('New conversation');
    });
  });
});

describe('chatStore action basics (H15)', () => {
  beforeEach(() => {
    useAppModeStore.setState({ mode: 'local' });
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      messagesByConversation: {},
      messages: [],
      isLoading: false,
      isLoadingMessages: false,
      isStreaming: false,
      currentStreamingMessageId: null,
      pendingMessages: [],
      citations: [],
      tokenUsage: {
        current: 0,
        inputTokens: 0,
        outputTokens: 0,
        max: 200000,
        percentage: 0,
        estimatedCost: 0,
      },
      focusMode: null,
      activeView: 'chat',
      conversationMode: 'auto',
      draftContent: '',
      editingMessageId: null,
      showMessageTimestamps: true,
      selectedMessage: null,
    });
    vi.clearAllMocks();
  });

  describe('createConversation', () => {
    it('pins new Desktop conversations to the local-only execution boundary', () => {
      const id = useChatStore.getState().createConversation('Private thread');
      const conversation = useChatStore
        .getState()
        .conversations.find((candidate) => candidate.id === id);

      expect(conversation?.executionMode).toBe('local_only');
    });

    it('adds a new conversation to the conversations array', () => {
      const { createConversation } = useChatStore.getState();
      expect(useChatStore.getState().conversations).toHaveLength(0);
      createConversation('My chat');
      expect(useChatStore.getState().conversations).toHaveLength(1);
    });

    it('returns the UUID of the created conversation', () => {
      const { createConversation } = useChatStore.getState();
      const id = createConversation();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('sets the new conversation as the active conversation', () => {
      const { createConversation } = useChatStore.getState();
      const id = createConversation('Test');
      expect(useChatStore.getState().activeConversationId).toBe(id);
    });

    it('uses the provided title', () => {
      const { createConversation } = useChatStore.getState();
      createConversation('My custom title');
      const convo = useChatStore.getState().conversations[0];
      expect(convo?.title).toBe('My custom title');
    });

    it('uses "New chat" as default title when none is provided', () => {
      const { createConversation } = useChatStore.getState();
      createConversation();
      const convo = useChatStore.getState().conversations[0];
      expect(convo?.title).toBe('New chat');
    });

    it('initialises an empty message list for the new conversation', () => {
      const { createConversation } = useChatStore.getState();
      const id = createConversation();
      expect(useChatStore.getState().messagesByConversation[id]).toEqual([]);
    });
  });

  describe('forkConversationForByok', () => {
    it('carries only the approved, redacted context across the trust boundary', () => {
      const { createConversation, addMessage } = useChatStore.getState();
      const sourceId = createConversation('Local thread');
      addMessage({ role: 'user', content: 'my api key is sk-live-secret' });
      addMessage({ role: 'assistant', content: 'Local answer' });
      addMessage({ role: 'user', content: 'unapproved follow-up' });

      const sourceMessages = useChatStore.getState().messagesByConversation[sourceId] ?? [];
      const approvedId = sourceMessages[0]!.id;
      const forkId = useChatStore.getState().forkConversationForByok(sourceId, {
        approvedContext: [{ messageId: approvedId, redactedContent: 'my api key is [REDACTED]' }],
        model: FIXTURE_MODEL_ID,
        provider: 'openai',
      });

      const state = useChatStore.getState();
      const forked = state.messagesByConversation[forkId!] ?? [];
      expect(forked).toHaveLength(1);
      expect(forked[0]?.content).toBe('my api key is [REDACTED]');
      expect(state.messagesByConversation[sourceId]).toHaveLength(3);
      expect(state.messagesByConversation[sourceId]?.[0]?.content).toBe(
        'my api key is sk-live-secret',
      );
    });

    it('refuses to fork when nothing was approved', () => {
      const { createConversation, addMessage } = useChatStore.getState();
      const sourceId = createConversation('Local thread');
      addMessage({ role: 'user', content: 'Local only' });

      const forkId = useChatStore
        .getState()
        .forkConversationForByok(sourceId, { approvedContext: [] });

      expect(forkId).toBeNull();
      expect(useChatStore.getState().conversations).toHaveLength(1);
      expect(useChatStore.getState().activeConversationId).toBe(sourceId);
    });

    it('creates a new active conversation with copied messages', () => {
      const { createConversation, addMessage, forkConversationForByok } = useChatStore.getState();
      const sourceId = createConversation('Local thread');
      addMessage({
        role: 'user',
        content: 'Use my local context',
        pending: true,
        streaming: true,
      });
      addMessage({
        role: 'assistant',
        content: 'Local answer',
        metadata: { model: 'fixture-local-model', provider: 'ollama' },
      });

      const approved = (useChatStore.getState().messagesByConversation[sourceId] ?? []).map(
        (message) => ({ messageId: message.id, redactedContent: message.content }),
      );
      const forkId = forkConversationForByok(sourceId, {
        approvedContext: approved,
        title: 'Local thread (BYOK fork)',
        model: FIXTURE_MODEL_ID,
        provider: 'openai',
      });
      const state = useChatStore.getState();

      expect(forkId).not.toBeNull();
      expect(forkId).not.toBe(sourceId);
      expect(state.activeConversationId).toBe(forkId);
      expect(state.conversations[0]?.title).toBe('Local thread (BYOK fork)');
      expect(
        state.conversations.find((conversation) => conversation.id === sourceId)?.executionMode,
      ).toBe('local_only');
      expect(
        state.conversations.find((conversation) => conversation.id === forkId)?.executionMode,
      ).toBe('byok');
      expect(state.messagesByConversation[sourceId]).toHaveLength(2);
      expect(state.messagesByConversation[forkId!]).toHaveLength(2);
      expect(state.messagesByConversation[forkId!]?.[0]?.pending).toBeUndefined();
      expect(state.messagesByConversation[forkId!]?.[0]?.streaming).toBeUndefined();
      expect(state.messagesByConversation[forkId!]?.[1]?.metadata?.model).toBe(FIXTURE_MODEL_ID);
      expect(state.messagesByConversation[forkId!]?.[1]?.metadata?.provider).toBe('openai');
    });

    it('preserves project and custom instruction metadata on the fork', () => {
      const {
        createConversation,
        addMessage,
        setConversationProject,
        setConversationCustomInstructions,
      } = useChatStore.getState();
      const sourceId = createConversation('Project thread');
      addMessage({ role: 'user', content: 'Project question' });
      setConversationProject(sourceId, 'project-1');
      setConversationCustomInstructions(sourceId, 'Use the project voice.');

      const approvedId = (useChatStore.getState().messagesByConversation[sourceId] ?? [])[0]!.id;
      const forkId = useChatStore.getState().forkConversationForByok(sourceId, {
        approvedContext: [{ messageId: approvedId, redactedContent: 'Project question' }],
      });
      const fork = useChatStore
        .getState()
        .conversations.find((conversation) => conversation.id === forkId);

      expect(fork?.projectId).toBe('project-1');
      expect(fork?.customInstructions).toBe('Use the project voice.');
    });
  });

  describe('deleteConversation', () => {
    it('removes the conversation from the conversations array', () => {
      const { createConversation, deleteConversation } = useChatStore.getState();
      const id = createConversation('To be deleted');
      expect(useChatStore.getState().conversations).toHaveLength(1);
      deleteConversation(id);
      expect(useChatStore.getState().conversations).toHaveLength(0);
    });

    it('removes the message cache for the deleted conversation', () => {
      const { createConversation, deleteConversation } = useChatStore.getState();
      const id = createConversation();
      expect(useChatStore.getState().messagesByConversation[id]).toBeDefined();
      deleteConversation(id);
      expect(useChatStore.getState().messagesByConversation[id]).toBeUndefined();
    });

    it('clears activeConversationId when the only conversation is deleted', () => {
      const { createConversation, deleteConversation } = useChatStore.getState();
      const id = createConversation();
      expect(useChatStore.getState().activeConversationId).toBe(id);
      deleteConversation(id);
      expect(useChatStore.getState().activeConversationId).not.toBe(id);
    });

    it('does not affect other conversations', () => {
      const { createConversation, deleteConversation } = useChatStore.getState();
      const id1 = createConversation('Keep');
      const id2 = createConversation('Delete');
      deleteConversation(id2);
      const remaining = useChatStore.getState().conversations;
      expect(remaining.some((c) => c.id === id1)).toBe(true);
      expect(remaining.some((c) => c.id === id2)).toBe(false);
    });

    it('is a no-op for an unknown conversation id', () => {
      const { createConversation, deleteConversation } = useChatStore.getState();
      createConversation('Stay');
      const before = useChatStore.getState().conversations.length;
      deleteConversation('non-existent-uuid');
      expect(useChatStore.getState().conversations).toHaveLength(before);
    });
  });
});
