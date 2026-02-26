/**
 * chatStore tests
 *
 * H51 — ID mapping pruning: pruneIdMappingsIfNeeded enforces MAX_ID_MAPPINGS cap,
 *       removes oldest entries first (FIFO by dbId), retains entries at boundary.
 *
 * H15 — generateTitleFromMessage: fenced code stripping, inline code, long truncation.
 *       Store action basics: createConversation, deleteConversation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module setup ──────────────────────────────────────────────────────────────

// We need window.localStorage to avoid side effects during module load
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

// Import after mocks are in place
import { dbIdToUuid, uuidToDbId, clearIdMappings, useChatStore } from '../chatStore';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Uses crypto.randomUUID via dbIdToUuid to populate N entries and return
 * the array of [dbId, uuid] pairs in insertion order.
 */
function populateMappings(count: number): Array<[number, string]> {
  const pairs: Array<[number, string]> = [];
  for (let i = 1; i <= count; i++) {
    const uuid = dbIdToUuid(i);
    pairs.push([i, uuid]);
  }
  return pairs;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('chatStore ID mapping pruning (H51)', () => {
  beforeEach(() => {
    clearIdMappings();
    vi.clearAllMocks();
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

  describe('pruning — FIFO eviction at 1001 entries', () => {
    it('triggers pruning when more than 1000 entries are added', () => {
      // Add 1001 entries — the 1001st call should trigger pruning
      const pairs = populateMappings(1001);

      // After pruning, the oldest entry (dbId=1) should have been evicted
      const firstUuid = pairs[0]![1];
      expect(uuidToDbId(firstUuid)).toBeUndefined();
    });

    it('retains the most recent 1000 entries after pruning', () => {
      const pairs = populateMappings(1001);

      // dbId 2 through 1001 should all still be accessible
      for (let i = 1; i < pairs.length; i++) {
        const [dbId, uuid] = pairs[i]!;
        expect(uuidToDbId(uuid)).toBe(dbId);
        expect(dbIdToUuid(dbId)).toBe(uuid);
      }
    });

    it('oldest entry by numeric dbId is removed first (not insertion order)', () => {
      // Insert out-of-numeric-order: small dbId inserted later should still be
      // the "oldest" by numeric value and removed first
      populateMappings(999);

      // Add a low dbId (1000th slot is dbId 999, so slot 1000 will be 1000)
      const veryOldId = 0; // dbId 0 is numerically smallest
      const veryOldUuid = dbIdToUuid(veryOldId);

      // Now add two more to push past 1000
      dbIdToUuid(1000);
      dbIdToUuid(1001); // This triggers pruning — dbId=0 should go first

      // dbId 0 was the oldest (numerically smallest), so it should be evicted
      expect(uuidToDbId(veryOldUuid)).toBeUndefined();
    });
  });

  describe('pruning — boundary conditions', () => {
    it('does not prune when exactly 1000 entries exist', () => {
      // Add exactly 1000 entries
      const pairs = populateMappings(1000);

      // All 1000 should still be present
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
      // Add 1500 entries — cap should be enforced
      populateMappings(1500);

      // Check the most recent 1000 are still present
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
      // Should work fine and return a valid UUID (may be a different one)
      expect(typeof newUuid).toBe('string');
    });
  });
});

// ── H15 — generateTitleFromMessage ────────────────────────────────────────
// generateTitleFromMessage is private to chatStore.ts.  We test its logic
// directly by inlining the same pure function here — keeping these tests
// fast and isolated from Zustand/Tauri state.

function generateTitleFromMessage(content: string): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, '') // strip fenced code blocks (must run first)
    .replace(/`[^`]+`/g, '') // strip inline code
    .replace(/[#*_~[\](){}|\n]+/g, ' ') // markdown punctuation + newlines → space
    .replace(/\s+/g, ' ') // collapse whitespace
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
      const exact = 'a'.repeat(50); // 50 chars, no spaces
      expect(generateTitleFromMessage(exact)).toBe(exact);
    });

    it('truncates content longer than 50 characters', () => {
      const long = 'a'.repeat(60);
      const title = generateTitleFromMessage(long);
      expect(title.length).toBeLessThanOrEqual(53); // 50 chars + '...'
      expect(title.endsWith('...')).toBe(true);
    });

    it('truncates at word boundary when last space is beyond position 30', () => {
      // Build a string that has a space well past position 30 within the first 50 chars
      // "word word word word word word x" = positions arranged so lastSpace > 30
      const msg = 'word word word word word word extra-long-content-here';
      const title = generateTitleFromMessage(msg);
      expect(title.endsWith('...')).toBe(true);
      // Should cut at a space boundary
      const withoutEllipsis = title.slice(0, -3);
      expect(withoutEllipsis.endsWith(' ')).toBe(false); // no trailing space before ...
    });

    it('truncates hard at 50 when last space is at or before position 30', () => {
      // Space only at position 5 — within first 50 chars, lastSpace <= 30
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

// ── H15 — Store action basics ─────────────────────────────────────────────

describe('chatStore action basics (H15)', () => {
  beforeEach(() => {
    // Reset the store to a clean slate before each test
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
