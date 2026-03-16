/**
 * Chat Store Tests
 *
 * Comprehensive tests for the feature-level chat store that handles sessions,
 * messages, streaming state, debounce guards, and Supabase persistence.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';

// Mock crypto.randomUUID for deterministic IDs
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => {
    uuidCounter++;
    return `test-uuid-${uuidCounter}`;
  }),
});

// Mock supabase-client before importing the store
vi.mock('@shared/lib/supabase-client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  },
}));

import { useChatStore, getGreetingTime } from '../chat-store';

describe('ChatStore', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    uuidCounter = 0;

    // Reset store to initial state
    useChatStore.getState().reset();

    // Advance past any debounce window from previous tests (500ms guard)
    vi.advanceTimersByTime(1500);
  });

  // ==========================================================================
  // 1. createSession
  // ==========================================================================

  describe('createSession', () => {
    it('creates a session with correct defaults', () => {
      const id = useChatStore.getState().createSession();

      const state = useChatStore.getState();
      expect(state.sessions).toHaveLength(1);

      const session = state.sessions[0]!;
      expect(session.id).toBe(id);
      expect(session.title).toBe('New Chat');
      expect(session.preview).toBe('');
      expect(session.messageCount).toBe(0);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.updatedAt).toBeInstanceOf(Date);
      expect(session.userId).toBeUndefined();
    });

    it('sets activeSessionId to the new session', () => {
      const id = useChatStore.getState().createSession();
      expect(useChatStore.getState().activeSessionId).toBe(id);
    });

    it('returns the session ID', () => {
      const id = useChatStore.getState().createSession();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('initializes an empty messages array for the session', () => {
      const id = useChatStore.getState().createSession();
      expect(useChatStore.getState().messages[id]).toEqual([]);
    });

    it('prepends new session to the beginning of sessions array', () => {
      const id1 = useChatStore.getState().createSession();
      vi.advanceTimersByTime(1500); // bypass debounce
      const id2 = useChatStore.getState().createSession();

      const sessions = useChatStore.getState().sessions;
      expect(sessions[0]!.id).toBe(id2);
      expect(sessions[1]!.id).toBe(id1);
    });

    it('stores userId when provided', () => {
      const id = useChatStore.getState().createSession('user-123');

      const session = useChatStore.getState().sessions.find((s) => s.id === id);
      expect(session?.userId).toBe('user-123');
    });
  });

  // ==========================================================================
  // 2. createSession debounce
  // ==========================================================================

  describe('createSession debounce guard', () => {
    it('returns the same session ID when called twice within 1 second', () => {
      const id1 = useChatStore.getState().createSession();
      // Do NOT advance time — call immediately
      const id2 = useChatStore.getState().createSession();

      expect(id1).toBe(id2);
      expect(useChatStore.getState().sessions).toHaveLength(1);
    });

    it('creates a new session after the 1-second debounce window', () => {
      const id1 = useChatStore.getState().createSession();
      vi.advanceTimersByTime(1500);
      const id2 = useChatStore.getState().createSession();

      expect(id1).not.toBe(id2);
      expect(useChatStore.getState().sessions).toHaveLength(2);
    });

    it('returns existing activeSessionId during debounce even with multiple rapid calls', () => {
      const id1 = useChatStore.getState().createSession();
      const id2 = useChatStore.getState().createSession();
      const id3 = useChatStore.getState().createSession();

      expect(id1).toBe(id2);
      expect(id2).toBe(id3);
      expect(useChatStore.getState().sessions).toHaveLength(1);
    });
  });

  // ==========================================================================
  // 3. deleteSession
  // ==========================================================================

  describe('deleteSession', () => {
    it('removes the session from the sessions array', () => {
      const id = useChatStore.getState().createSession();
      useChatStore.getState().deleteSession(id);

      expect(useChatStore.getState().sessions).toHaveLength(0);
    });

    it('removes messages associated with the session', () => {
      const id = useChatStore.getState().createSession();
      useChatStore.getState().addMessage(id, { role: 'user', content: 'hello' });
      useChatStore.getState().deleteSession(id);

      expect(useChatStore.getState().messages[id]).toBeUndefined();
    });

    it('updates activeSessionId to the first remaining session', () => {
      const id1 = useChatStore.getState().createSession();
      vi.advanceTimersByTime(1500);
      const id2 = useChatStore.getState().createSession();

      // id2 is active
      expect(useChatStore.getState().activeSessionId).toBe(id2);

      useChatStore.getState().deleteSession(id2);

      // Should fall back to id1
      expect(useChatStore.getState().activeSessionId).toBe(id1);
    });

    it('sets activeSessionId to null when the last session is deleted', () => {
      const id = useChatStore.getState().createSession();
      useChatStore.getState().deleteSession(id);

      expect(useChatStore.getState().activeSessionId).toBeNull();
    });

    it('does not change activeSessionId when deleting a non-active session', () => {
      const id1 = useChatStore.getState().createSession();
      vi.advanceTimersByTime(1500);
      const id2 = useChatStore.getState().createSession();

      // id2 is active, delete id1
      useChatStore.getState().deleteSession(id1);

      expect(useChatStore.getState().activeSessionId).toBe(id2);
      expect(useChatStore.getState().sessions).toHaveLength(1);
    });
  });

  // ==========================================================================
  // 4. renameSession
  // ==========================================================================

  describe('renameSession', () => {
    it('updates the session title', () => {
      const id = useChatStore.getState().createSession();
      useChatStore.getState().renameSession(id, 'My Renamed Chat');

      const session = useChatStore.getState().sessions.find((s) => s.id === id);
      expect(session?.title).toBe('My Renamed Chat');
    });

    it('updates the updatedAt timestamp', () => {
      const id = useChatStore.getState().createSession();
      const originalUpdatedAt = useChatStore
        .getState()
        .sessions.find((s) => s.id === id)!.updatedAt;

      vi.advanceTimersByTime(100);
      useChatStore.getState().renameSession(id, 'New Title');

      const updatedSession = useChatStore.getState().sessions.find((s) => s.id === id)!;
      expect(updatedSession.updatedAt.getTime()).toBeGreaterThanOrEqual(
        originalUpdatedAt.getTime(),
      );
    });

    it('does nothing for a non-existent session ID', () => {
      expect(() => {
        useChatStore.getState().renameSession('nonexistent-id', 'Title');
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // 5. addMessage
  // ==========================================================================

  describe('addMessage', () => {
    it('adds a message to the correct session', () => {
      const sessionId = useChatStore.getState().createSession();
      const msgId = useChatStore.getState().addMessage(sessionId, {
        role: 'user',
        content: 'Hello world',
      });

      const messages = useChatStore.getState().messages[sessionId]!;
      expect(messages).toHaveLength(1);
      expect(messages[0]!.id).toBe(msgId);
      expect(messages[0]!.content).toBe('Hello world');
      expect(messages[0]!.role).toBe('user');
      expect(messages[0]!.sessionId).toBe(sessionId);
      expect(messages[0]!.createdAt).toBeInstanceOf(Date);
    });

    it('returns a unique message ID', () => {
      const sessionId = useChatStore.getState().createSession();
      const msgId1 = useChatStore.getState().addMessage(sessionId, {
        role: 'user',
        content: 'first',
      });
      const msgId2 = useChatStore.getState().addMessage(sessionId, {
        role: 'user',
        content: 'second',
      });

      expect(msgId1).not.toBe(msgId2);
    });

    it('updates session preview with message content (truncated to 100 chars)', () => {
      const sessionId = useChatStore.getState().createSession();
      const longContent = 'x'.repeat(200);
      useChatStore.getState().addMessage(sessionId, { role: 'user', content: longContent });

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId)!;
      expect(session.preview).toHaveLength(100);
      expect(session.preview).toBe('x'.repeat(100));
    });

    it('updates session messageCount', () => {
      const sessionId = useChatStore.getState().createSession();
      useChatStore.getState().addMessage(sessionId, { role: 'user', content: 'msg1' });
      useChatStore.getState().addMessage(sessionId, { role: 'assistant', content: 'msg2' });

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId)!;
      expect(session.messageCount).toBe(2);
    });

    it('updates session updatedAt', () => {
      const sessionId = useChatStore.getState().createSession();
      const originalUpdatedAt = useChatStore
        .getState()
        .sessions.find((s) => s.id === sessionId)!.updatedAt;

      vi.advanceTimersByTime(100);
      useChatStore.getState().addMessage(sessionId, { role: 'user', content: 'test' });

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId)!;
      expect(session.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
    });

    it('auto-titles session from first user message', () => {
      const sessionId = useChatStore.getState().createSession();
      useChatStore.getState().addMessage(sessionId, {
        role: 'user',
        content: 'How do I deploy a Next.js app?',
      });

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId)!;
      expect(session.title).toBe('How do I deploy a Next.js app?');
    });

    it('auto-title truncates at 50 chars with ellipsis for long messages', () => {
      const sessionId = useChatStore.getState().createSession();
      const longContent = 'a'.repeat(80);
      useChatStore.getState().addMessage(sessionId, { role: 'user', content: longContent });

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId)!;
      expect(session.title).toBe('a'.repeat(50) + '...');
      expect(session.title).toHaveLength(53);
    });

    it('auto-title does not add ellipsis when message is exactly 50 chars', () => {
      const sessionId = useChatStore.getState().createSession();
      useChatStore.getState().addMessage(sessionId, { role: 'user', content: 'b'.repeat(50) });

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId)!;
      expect(session.title).toBe('b'.repeat(50));
    });

    it('does NOT auto-title from assistant messages', () => {
      const sessionId = useChatStore.getState().createSession();
      useChatStore.getState().addMessage(sessionId, {
        role: 'assistant',
        content: 'I am an assistant',
      });

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId)!;
      expect(session.title).toBe('New Chat');
    });

    it('does NOT auto-title if session already has a custom title', () => {
      const sessionId = useChatStore.getState().createSession();
      useChatStore.getState().renameSession(sessionId, 'Custom Title');
      useChatStore.getState().addMessage(sessionId, {
        role: 'user',
        content: 'This should not become the title',
      });

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId)!;
      expect(session.title).toBe('Custom Title');
    });

    it('creates messages array if session has none', () => {
      const sessionId = useChatStore.getState().createSession();

      // Force-remove messages for this session
      useChatStore.setState((state) => {
        delete state.messages[sessionId];
      });

      useChatStore.getState().addMessage(sessionId, { role: 'user', content: 'test' });
      expect(useChatStore.getState().messages[sessionId]).toHaveLength(1);
    });

    it('preserves message metadata', () => {
      const sessionId = useChatStore.getState().createSession();
      const msgId = useChatStore.getState().addMessage(sessionId, {
        role: 'assistant',
        content: 'response',
        metadata: { model: 'gpt-4', tokensUsed: 150 },
      });

      const msg = useChatStore.getState().messages[sessionId]!.find((m) => m.id === msgId)!;
      expect(msg.metadata?.model).toBe('gpt-4');
      expect(msg.metadata?.tokensUsed).toBe(150);
    });
  });

  // ==========================================================================
  // 6. updateMessage
  // ==========================================================================

  describe('updateMessage', () => {
    it('updates the content of a specific message', () => {
      const sessionId = useChatStore.getState().createSession();
      const msgId = useChatStore.getState().addMessage(sessionId, {
        role: 'assistant',
        content: 'original',
      });

      useChatStore.getState().updateMessage(sessionId, msgId, 'updated content');

      const msg = useChatStore.getState().messages[sessionId]!.find((m) => m.id === msgId)!;
      expect(msg.content).toBe('updated content');
    });

    it('does nothing for a non-existent session', () => {
      expect(() => {
        useChatStore.getState().updateMessage('nonexistent', 'msg-1', 'content');
      }).not.toThrow();
    });

    it('does nothing for a non-existent message', () => {
      const sessionId = useChatStore.getState().createSession();
      expect(() => {
        useChatStore.getState().updateMessage(sessionId, 'nonexistent', 'content');
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // 7. deleteMessage
  // ==========================================================================

  describe('deleteMessage', () => {
    it('removes the message from the session', () => {
      const sessionId = useChatStore.getState().createSession();
      const msgId = useChatStore.getState().addMessage(sessionId, {
        role: 'user',
        content: 'delete me',
      });

      useChatStore.getState().deleteMessage(sessionId, msgId);

      expect(useChatStore.getState().messages[sessionId]).toHaveLength(0);
    });

    it('does not affect other messages in the same session', () => {
      const sessionId = useChatStore.getState().createSession();
      const msgId1 = useChatStore.getState().addMessage(sessionId, {
        role: 'user',
        content: 'keep me',
      });
      const msgId2 = useChatStore.getState().addMessage(sessionId, {
        role: 'assistant',
        content: 'delete me',
      });

      useChatStore.getState().deleteMessage(sessionId, msgId2);

      const messages = useChatStore.getState().messages[sessionId]!;
      expect(messages).toHaveLength(1);
      expect(messages[0]!.id).toBe(msgId1);
    });

    it('does nothing for a non-existent session', () => {
      expect(() => {
        useChatStore.getState().deleteMessage('nonexistent', 'msg-1');
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // 8. setStreaming / appendToMessage
  // ==========================================================================

  describe('setStreaming', () => {
    it('sets isStreaming to true on a message', () => {
      const sessionId = useChatStore.getState().createSession();
      const msgId = useChatStore.getState().addMessage(sessionId, {
        role: 'assistant',
        content: '',
      });

      useChatStore.getState().setStreaming(sessionId, msgId, true);

      const msg = useChatStore.getState().messages[sessionId]!.find((m) => m.id === msgId)!;
      expect(msg.isStreaming).toBe(true);
    });

    it('sets isStreaming back to false', () => {
      const sessionId = useChatStore.getState().createSession();
      const msgId = useChatStore.getState().addMessage(sessionId, {
        role: 'assistant',
        content: '',
      });

      useChatStore.getState().setStreaming(sessionId, msgId, true);
      useChatStore.getState().setStreaming(sessionId, msgId, false);

      const msg = useChatStore.getState().messages[sessionId]!.find((m) => m.id === msgId)!;
      expect(msg.isStreaming).toBe(false);
    });

    it('does nothing for a non-existent message', () => {
      const sessionId = useChatStore.getState().createSession();
      expect(() => {
        useChatStore.getState().setStreaming(sessionId, 'nonexistent', true);
      }).not.toThrow();
    });
  });

  describe('appendToMessage', () => {
    it('appends a chunk of content to an existing message', () => {
      const sessionId = useChatStore.getState().createSession();
      const msgId = useChatStore.getState().addMessage(sessionId, {
        role: 'assistant',
        content: 'Hello',
      });

      useChatStore.getState().appendToMessage(sessionId, msgId, ' world');

      const msg = useChatStore.getState().messages[sessionId]!.find((m) => m.id === msgId)!;
      expect(msg.content).toBe('Hello world');
    });

    it('appends multiple chunks sequentially', () => {
      const sessionId = useChatStore.getState().createSession();
      const msgId = useChatStore.getState().addMessage(sessionId, {
        role: 'assistant',
        content: '',
      });

      useChatStore.getState().appendToMessage(sessionId, msgId, 'chunk1');
      useChatStore.getState().appendToMessage(sessionId, msgId, ' chunk2');
      useChatStore.getState().appendToMessage(sessionId, msgId, ' chunk3');

      const msg = useChatStore.getState().messages[sessionId]!.find((m) => m.id === msgId)!;
      expect(msg.content).toBe('chunk1 chunk2 chunk3');
    });

    it('does nothing for a non-existent message', () => {
      const sessionId = useChatStore.getState().createSession();
      expect(() => {
        useChatStore.getState().appendToMessage(sessionId, 'nonexistent', 'chunk');
      }).not.toThrow();
    });

    it('does nothing for a non-existent session', () => {
      expect(() => {
        useChatStore.getState().appendToMessage('nonexistent', 'msg-1', 'chunk');
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // 9. clearSession
  // ==========================================================================

  describe('clearSession', () => {
    it('clears all messages from a session', () => {
      const sessionId = useChatStore.getState().createSession();
      useChatStore.getState().addMessage(sessionId, { role: 'user', content: 'msg1' });
      useChatStore.getState().addMessage(sessionId, { role: 'assistant', content: 'msg2' });

      useChatStore.getState().clearSession(sessionId);

      expect(useChatStore.getState().messages[sessionId]).toHaveLength(0);
    });

    it('resets messageCount to 0', () => {
      const sessionId = useChatStore.getState().createSession();
      useChatStore.getState().addMessage(sessionId, { role: 'user', content: 'msg1' });

      useChatStore.getState().clearSession(sessionId);

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId)!;
      expect(session.messageCount).toBe(0);
    });

    it('resets preview to empty string', () => {
      const sessionId = useChatStore.getState().createSession();
      useChatStore.getState().addMessage(sessionId, { role: 'user', content: 'some content' });

      useChatStore.getState().clearSession(sessionId);

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId)!;
      expect(session.preview).toBe('');
    });

    it('preserves the session itself in the sessions array', () => {
      const sessionId = useChatStore.getState().createSession();
      useChatStore.getState().addMessage(sessionId, { role: 'user', content: 'msg' });

      useChatStore.getState().clearSession(sessionId);

      expect(useChatStore.getState().sessions).toHaveLength(1);
      expect(useChatStore.getState().sessions[0]!.id).toBe(sessionId);
    });
  });

  // ==========================================================================
  // 10. reset
  // ==========================================================================

  describe('reset', () => {
    it('resets all state to initial values', () => {
      // Build up some state
      const sessionId = useChatStore.getState().createSession();
      useChatStore.getState().addMessage(sessionId, { role: 'user', content: 'hello' });
      useChatStore.getState().setLoading(true);
      useChatStore.getState().setSidebarOpen(false);

      // Reset
      useChatStore.getState().reset();

      const state = useChatStore.getState();
      expect(state.sessions).toEqual([]);
      expect(state.messages).toEqual({});
      expect(state.activeSessionId).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.sidebarOpen).toBe(true);
      expect(state.dbLoaded).toBe(false);
    });

    it('allows creating sessions after reset', () => {
      const id1 = useChatStore.getState().createSession();
      useChatStore.getState().reset();

      vi.advanceTimersByTime(1500); // bypass debounce
      const id2 = useChatStore.getState().createSession();

      expect(useChatStore.getState().sessions).toHaveLength(1);
      expect(id2).not.toBe(id1);
    });
  });

  // ==========================================================================
  // 11. getGreetingTime
  // ==========================================================================

  describe('getGreetingTime', () => {
    // getGreetingTime tests use vi.setSystemTime which moves the clock to specific
    // dates in 2024. We must restore the clock to a far-future date after each test
    // so the module-level debounce guard (lastSessionCreatedAt) doesn't get confused
    // by Date.now() jumping backward relative to previously recorded timestamps.
    afterEach(() => {
      vi.setSystemTime(new Date('2099-01-01T00:00:00'));
    });

    it('returns "morning" at midnight (hour 0)', () => {
      vi.setSystemTime(new Date('2024-06-15T00:00:00'));
      expect(getGreetingTime()).toBe('morning');
    });

    it('returns "morning" at 11:59 AM', () => {
      vi.setSystemTime(new Date('2024-06-15T11:59:00'));
      expect(getGreetingTime()).toBe('morning');
    });

    it('returns "afternoon" at noon (hour 12)', () => {
      vi.setSystemTime(new Date('2024-06-15T12:00:00'));
      expect(getGreetingTime()).toBe('afternoon');
    });

    it('returns "afternoon" at 4:59 PM (hour 16)', () => {
      vi.setSystemTime(new Date('2024-06-15T16:59:00'));
      expect(getGreetingTime()).toBe('afternoon');
    });

    it('returns "evening" at 5:00 PM (hour 17)', () => {
      vi.setSystemTime(new Date('2024-06-15T17:00:00'));
      expect(getGreetingTime()).toBe('evening');
    });

    it('returns "evening" at 11:59 PM (hour 23)', () => {
      vi.setSystemTime(new Date('2024-06-15T23:59:00'));
      expect(getGreetingTime()).toBe('evening');
    });
  });

  // ==========================================================================
  // Additional: UI state helpers
  // ==========================================================================

  describe('setLoading', () => {
    it('toggles isLoading flag', () => {
      expect(useChatStore.getState().isLoading).toBe(false);

      useChatStore.getState().setLoading(true);
      expect(useChatStore.getState().isLoading).toBe(true);

      useChatStore.getState().setLoading(false);
      expect(useChatStore.getState().isLoading).toBe(false);
    });
  });

  describe('setSidebarOpen', () => {
    it('sets sidebar open state', () => {
      expect(useChatStore.getState().sidebarOpen).toBe(true);

      useChatStore.getState().setSidebarOpen(false);
      expect(useChatStore.getState().sidebarOpen).toBe(false);

      useChatStore.getState().setSidebarOpen(true);
      expect(useChatStore.getState().sidebarOpen).toBe(true);
    });
  });

  describe('setActiveSession', () => {
    it('sets the active session ID', () => {
      const id = useChatStore.getState().createSession();
      vi.advanceTimersByTime(1500);
      const id2 = useChatStore.getState().createSession();

      useChatStore.getState().setActiveSession(id);
      expect(useChatStore.getState().activeSessionId).toBe(id);

      useChatStore.getState().setActiveSession(id2);
      expect(useChatStore.getState().activeSessionId).toBe(id2);
    });

    it('allows setting activeSessionId to null', () => {
      useChatStore.getState().createSession();
      useChatStore.getState().setActiveSession(null);
      expect(useChatStore.getState().activeSessionId).toBeNull();
    });
  });

  describe('getSessionMessages', () => {
    it('returns messages for a valid session', () => {
      const sessionId = useChatStore.getState().createSession();
      useChatStore.getState().addMessage(sessionId, { role: 'user', content: 'hello' });
      useChatStore.getState().addMessage(sessionId, { role: 'assistant', content: 'hi' });

      const messages = useChatStore.getState().getSessionMessages(sessionId);
      expect(messages).toHaveLength(2);
      expect(messages[0]!.content).toBe('hello');
      expect(messages[1]!.content).toBe('hi');
    });

    it('returns empty array for a non-existent session', () => {
      const messages = useChatStore.getState().getSessionMessages('nonexistent');
      expect(messages).toEqual([]);
    });
  });

  // ==========================================================================
  // Supabase Persistence
  // ==========================================================================

  describe('Supabase persistence', () => {
    let mockSupabase: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      const mod = await import('@shared/lib/supabase-client');
      mockSupabase = vi.mocked(mod.supabase.from);
    });

    describe('loadSessionsFromDb', () => {
      it('maps DB rows to ChatSession objects and merges with local sessions', async () => {
        const dbRows = [
          {
            id: 'db-1',
            title: 'DB Session',
            created_at: '2024-01-02T00:00:00Z',
            updated_at: '2024-01-03T00:00:00Z',
            preview: 'preview text',
            message_count: 5,
            user_id: 'u1',
          },
        ];

        // Create a local session first
        const localId = useChatStore.getState().createSession();

        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: dbRows, error: null }),
        };
        mockSupabase.mockReturnValue(chain as unknown);

        await useChatStore.getState().loadSessionsFromDb('u1');

        const state = useChatStore.getState();
        expect(state.dbLoaded).toBe(true);

        const ids = state.sessions.map((s) => s.id);
        expect(ids).toContain('db-1');
        expect(ids).toContain(localId);

        const dbSession = state.sessions.find((s) => s.id === 'db-1')!;
        expect(dbSession.title).toBe('DB Session');
        expect(dbSession.preview).toBe('preview text');
        expect(dbSession.messageCount).toBe(5);
      });

      it('uses fallback values for null DB fields', async () => {
        const dbRows = [
          {
            id: 'db-null',
            title: null,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            preview: null,
            message_count: null,
            user_id: 'u1',
          },
        ];

        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: dbRows, error: null }),
        };
        mockSupabase.mockReturnValue(chain as unknown);

        await useChatStore.getState().loadSessionsFromDb('u1');

        const session = useChatStore.getState().sessions.find((s) => s.id === 'db-null')!;
        expect(session.title).toBe('Untitled');
        expect(session.preview).toBe('');
        expect(session.messageCount).toBe(0);
      });

      it('sets dbLoaded=true even with empty results', async () => {
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
        mockSupabase.mockReturnValue(chain as unknown);

        await useChatStore.getState().loadSessionsFromDb('u1');
        expect(useChatStore.getState().dbLoaded).toBe(true);
      });

      it('handles DB errors gracefully', async () => {
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Query failed' } }),
        };
        mockSupabase.mockReturnValue(chain as unknown);

        await useChatStore.getState().loadSessionsFromDb('u1');

        // Should not throw; sessions should be unchanged
        expect(useChatStore.getState().sessions).toHaveLength(0);
      });

      it('handles thrown exceptions and sets dbLoaded=true', async () => {
        mockSupabase.mockImplementation(() => {
          throw new Error('Connection failed');
        });

        await useChatStore.getState().loadSessionsFromDb('u1');
        expect(useChatStore.getState().dbLoaded).toBe(true);
      });
    });

    describe('loadMessagesFromDb', () => {
      it('maps DB rows to ChatMessage with timestamp fallback', async () => {
        const dbRows = [
          {
            id: 'm1',
            session_id: 's1',
            role: 'user',
            content: 'hello',
            timestamp: '2024-06-01T10:00:00Z',
            metadata: { model: 'gpt-4' },
          },
          {
            id: 'm2',
            session_id: 's1',
            role: 'assistant',
            content: null,
            timestamp: null,
            created_at: '2024-06-01T10:01:00Z',
            metadata: null,
          },
          {
            id: 'm3',
            session_id: 's1',
            role: 'user',
            content: 'test',
            timestamp: null,
            created_at: null,
            metadata: null,
          },
        ];

        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: dbRows, error: null }),
        };
        mockSupabase.mockReturnValue(chain as unknown);

        await useChatStore.getState().loadMessagesFromDb('s1');

        const msgs = useChatStore.getState().messages['s1']!;
        expect(msgs).toHaveLength(3);

        expect(msgs[0]!.id).toBe('m1');
        expect(msgs[0]!.content).toBe('hello');
        expect(msgs[0]!.createdAt).toEqual(new Date('2024-06-01T10:00:00Z'));
        expect(msgs[0]!.metadata).toEqual({ model: 'gpt-4' });
        expect(msgs[0]!.isStreaming).toBe(false);

        // Fallback to created_at
        expect(msgs[1]!.createdAt).toEqual(new Date('2024-06-01T10:01:00Z'));
        expect(msgs[1]!.content).toBe('');

        // Fallback to new Date()
        expect(msgs[2]!.createdAt).toBeInstanceOf(Date);
      });

      it('does not set messages when data is empty', async () => {
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
        mockSupabase.mockReturnValue(chain as unknown);

        await useChatStore.getState().loadMessagesFromDb('s1');
        expect(useChatStore.getState().messages['s1']).toBeUndefined();
      });

      it('handles DB errors gracefully', async () => {
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: null, error: { message: 'err' } }),
        };
        mockSupabase.mockReturnValue(chain as unknown);

        await expect(useChatStore.getState().loadMessagesFromDb('s1')).resolves.toBeUndefined();
      });
    });

    describe('saveSessionToDb', () => {
      it('calls upsert with correctly mapped fields', async () => {
        const upsertMock = vi.fn().mockResolvedValue({ error: null });
        mockSupabase.mockReturnValue({ upsert: upsertMock } as unknown);

        const now = new Date('2024-06-01T12:00:00Z');
        const session = {
          id: 'sess-1',
          title: 'My Chat',
          createdAt: now,
          updatedAt: now,
          preview: 'hello',
          messageCount: 5,
          userId: 'u1',
        };

        await useChatStore.getState().saveSessionToDb(session, 'u1');

        expect(upsertMock).toHaveBeenCalledWith({
          id: 'sess-1',
          user_id: 'u1',
          title: 'My Chat',
          preview: 'hello',
          message_count: 5,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
          is_pinned: false,
          is_archived: false,
        });
      });

      it('handles upsert errors gracefully', async () => {
        mockSupabase.mockImplementation(() => {
          throw new Error('DB error');
        });

        const session = {
          id: 's1',
          title: 'Chat',
          createdAt: new Date(),
          updatedAt: new Date(),
          preview: '',
          messageCount: 0,
        };

        await expect(
          useChatStore.getState().saveSessionToDb(session, 'u1'),
        ).resolves.toBeUndefined();
      });
    });

    describe('saveMessageToDb', () => {
      it('calls upsert with correctly mapped fields', async () => {
        const upsertMock = vi.fn().mockResolvedValue({ error: null });
        mockSupabase.mockReturnValue({ upsert: upsertMock } as unknown);

        const message = {
          id: 'msg-1',
          sessionId: 's1',
          role: 'user' as const,
          content: 'hello',
          createdAt: new Date(),
          metadata: { model: 'gpt-4' },
        };

        await useChatStore.getState().saveMessageToDb(message, 'u1');

        expect(upsertMock).toHaveBeenCalledWith({
          id: 'msg-1',
          session_id: 's1',
          user_id: 'u1',
          role: 'user',
          content: 'hello',
          metadata: { model: 'gpt-4' },
          is_streaming: false,
        });
      });

      it('defaults metadata to empty object when undefined', async () => {
        const upsertMock = vi.fn().mockResolvedValue({ error: null });
        mockSupabase.mockReturnValue({ upsert: upsertMock } as unknown);

        const message = {
          id: 'msg-2',
          sessionId: 's1',
          role: 'assistant' as const,
          content: 'reply',
          createdAt: new Date(),
        };

        await useChatStore.getState().saveMessageToDb(message, 'u1');

        expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ metadata: {} }));
      });

      it('handles errors gracefully', async () => {
        mockSupabase.mockImplementation(() => {
          throw new Error('DB error');
        });

        const message = {
          id: 'msg-3',
          sessionId: 's1',
          role: 'user' as const,
          content: 'x',
          createdAt: new Date(),
        };

        await expect(
          useChatStore.getState().saveMessageToDb(message, 'u1'),
        ).resolves.toBeUndefined();
      });
    });
  });
});
