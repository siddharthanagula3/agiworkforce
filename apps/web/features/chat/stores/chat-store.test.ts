/**
 * Chat Store Tests (features/chat/stores/chat-store)
 *
 * Tests for the feature-level chat store that handles sessions, messages,
 * streaming state, and Supabase persistence.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock supabase-client before importing the store
vi.mock('@shared/lib/supabase-client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  },
}));

import { useChatStore, getGreetingTime } from './chat-store';

describe('ChatStore (features/chat)', () => {
  beforeEach(() => {
    // Reset store to initial state
    useChatStore.setState({
      sessions: [],
      messages: {},
      activeSessionId: null,
      isLoading: false,
      sidebarOpen: true,
      dbLoaded: false,
    });
  });

  // ==========================================================================
  // Session Management
  // ==========================================================================

  describe('createSession', () => {
    it('creates a session and adds it to sessions array', () => {
      const { createSession } = useChatStore.getState();
      const id = createSession();

      const state = useChatStore.getState();
      expect(state.sessions).toHaveLength(1);
      expect(state.sessions[0].id).toBe(id);
      expect(state.sessions[0].title).toBe('New Chat');
      expect(state.sessions[0].messageCount).toBe(0);
      expect(state.sessions[0].preview).toBe('');
    });

    it('sets the new session as active', () => {
      const { createSession } = useChatStore.getState();
      const id = createSession();

      expect(useChatStore.getState().activeSessionId).toBe(id);
    });

    it('initialises an empty messages array for the session', () => {
      const { createSession } = useChatStore.getState();
      const id = createSession();

      expect(useChatStore.getState().messages[id]).toEqual([]);
    });

    it('returns a unique id string', () => {
      const { createSession } = useChatStore.getState();
      const id1 = createSession();
      const id2 = useChatStore.getState().createSession();

      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
      expect(id1).not.toBe(id2);
    });

    it('prepends (unshifts) new session so most recent is first', () => {
      const { createSession } = useChatStore.getState();
      const id1 = createSession();
      const id2 = useChatStore.getState().createSession();

      const { sessions } = useChatStore.getState();
      expect(sessions[0].id).toBe(id2);
      expect(sessions[1].id).toBe(id1);
    });
  });

  describe('deleteSession', () => {
    it('removes the session from the sessions array', () => {
      const { createSession } = useChatStore.getState();
      const id = createSession();

      useChatStore.getState().deleteSession(id);

      expect(useChatStore.getState().sessions).toHaveLength(0);
    });

    it('removes messages associated with the session', () => {
      const { createSession } = useChatStore.getState();
      const id = createSession();

      useChatStore.getState().addMessage(id, { role: 'user', content: 'test' });
      useChatStore.getState().deleteSession(id);

      expect(useChatStore.getState().messages[id]).toBeUndefined();
    });

    it('sets activeSessionId to the next session if available', () => {
      const { createSession } = useChatStore.getState();
      const id1 = createSession();
      const id2 = useChatStore.getState().createSession();

      // id2 is now active (most recently created)
      useChatStore.getState().deleteSession(id2);

      // Should fall back to the remaining session
      expect(useChatStore.getState().activeSessionId).toBe(id1);
    });

    it('sets activeSessionId to null when last session deleted', () => {
      const { createSession } = useChatStore.getState();
      const id = createSession();

      useChatStore.getState().deleteSession(id);

      expect(useChatStore.getState().activeSessionId).toBeNull();
    });
  });

  describe('renameSession', () => {
    it('updates the session title', () => {
      const { createSession } = useChatStore.getState();
      const id = createSession();

      useChatStore.getState().renameSession(id, 'My Custom Title');

      const session = useChatStore.getState().sessions.find((s) => s.id === id);
      expect(session?.title).toBe('My Custom Title');
    });

    it('updates the session updatedAt timestamp', () => {
      const { createSession } = useChatStore.getState();
      const id = createSession();

      const beforeUpdate = useChatStore.getState().sessions.find((s) => s.id === id)!.updatedAt;
      useChatStore.getState().renameSession(id, 'Renamed');
      const afterUpdate = useChatStore.getState().sessions.find((s) => s.id === id)!.updatedAt;

      expect(afterUpdate.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });

    it('does nothing for non-existent session', () => {
      expect(() => {
        useChatStore.getState().renameSession('nonexistent', 'title');
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // Message Management
  // ==========================================================================

  describe('addMessage', () => {
    it('adds a message to the correct session', () => {
      const { createSession } = useChatStore.getState();
      const sessionId = createSession();

      const msgId = useChatStore.getState().addMessage(sessionId, {
        role: 'user',
        content: 'Hello',
      });

      const messages = useChatStore.getState().messages[sessionId];
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe(msgId);
      expect(messages[0].content).toBe('Hello');
      expect(messages[0].role).toBe('user');
      expect(messages[0].sessionId).toBe(sessionId);
    });

    it('returns a unique message id', () => {
      const { createSession } = useChatStore.getState();
      const sessionId = createSession();

      const msgId = useChatStore.getState().addMessage(sessionId, {
        role: 'user',
        content: 'test',
      });

      expect(typeof msgId).toBe('string');
      expect(msgId.length).toBeGreaterThan(0);
    });

    it('increments the session messageCount', () => {
      const { createSession } = useChatStore.getState();
      const sessionId = createSession();

      useChatStore.getState().addMessage(sessionId, { role: 'user', content: 'msg1' });
      useChatStore.getState().addMessage(sessionId, { role: 'assistant', content: 'msg2' });

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session?.messageCount).toBe(2);
    });

    it('updates session preview with message content', () => {
      const { createSession } = useChatStore.getState();
      const sessionId = createSession();

      useChatStore.getState().addMessage(sessionId, { role: 'user', content: 'Hello world' });

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session?.preview).toContain('Hello world');
    });

    it('auto-titles session from first user message', () => {
      const { createSession } = useChatStore.getState();
      const sessionId = createSession();

      useChatStore.getState().addMessage(sessionId, {
        role: 'user',
        content: 'How do I deploy a Next.js app?',
      });

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session?.title).toContain('How do I deploy');
    });

    it('creates messages array if session has none', () => {
      const { createSession } = useChatStore.getState();
      const sessionId = createSession();

      // Force-remove messages for this session
      useChatStore.setState((state) => {
        delete state.messages[sessionId];
      });

      useChatStore.getState().addMessage(sessionId, { role: 'user', content: 'test' });

      expect(useChatStore.getState().messages[sessionId]).toHaveLength(1);
    });
  });

  describe('appendToMessage', () => {
    it('appends content chunk to an existing message', () => {
      const { createSession } = useChatStore.getState();
      const sessionId = createSession();

      const msgId = useChatStore.getState().addMessage(sessionId, {
        role: 'assistant',
        content: 'Hello',
      });

      useChatStore.getState().appendToMessage(sessionId, msgId, ' world');

      const msg = useChatStore.getState().messages[sessionId].find((m) => m.id === msgId);
      expect(msg?.content).toBe('Hello world');
    });

    it('does nothing for non-existent message', () => {
      const { createSession } = useChatStore.getState();
      const sessionId = createSession();

      expect(() => {
        useChatStore.getState().appendToMessage(sessionId, 'nonexistent', 'chunk');
      }).not.toThrow();
    });
  });

  describe('setStreaming', () => {
    it('toggles isStreaming on a message', () => {
      const { createSession } = useChatStore.getState();
      const sessionId = createSession();

      const msgId = useChatStore.getState().addMessage(sessionId, {
        role: 'assistant',
        content: '',
      });

      useChatStore.getState().setStreaming(sessionId, msgId, true);
      let msg = useChatStore.getState().messages[sessionId].find((m) => m.id === msgId);
      expect(msg?.isStreaming).toBe(true);

      useChatStore.getState().setStreaming(sessionId, msgId, false);
      msg = useChatStore.getState().messages[sessionId].find((m) => m.id === msgId);
      expect(msg?.isStreaming).toBe(false);
    });
  });

  describe('deleteMessage', () => {
    it('removes the message from the session', () => {
      const { createSession } = useChatStore.getState();
      const sessionId = createSession();

      const msgId = useChatStore.getState().addMessage(sessionId, {
        role: 'user',
        content: 'test',
      });

      useChatStore.getState().deleteMessage(sessionId, msgId);

      expect(useChatStore.getState().messages[sessionId]).toHaveLength(0);
    });
  });

  describe('updateMessage', () => {
    it('updates message content', () => {
      const { createSession } = useChatStore.getState();
      const sessionId = createSession();

      const msgId = useChatStore.getState().addMessage(sessionId, {
        role: 'assistant',
        content: 'old',
      });

      useChatStore.getState().updateMessage(sessionId, msgId, 'new content');

      const msg = useChatStore.getState().messages[sessionId].find((m) => m.id === msgId);
      expect(msg?.content).toBe('new content');
    });
  });

  // ==========================================================================
  // UI State
  // ==========================================================================

  describe('setLoading', () => {
    it('toggles the isLoading flag', () => {
      expect(useChatStore.getState().isLoading).toBe(false);

      useChatStore.getState().setLoading(true);
      expect(useChatStore.getState().isLoading).toBe(true);

      useChatStore.getState().setLoading(false);
      expect(useChatStore.getState().isLoading).toBe(false);
    });
  });

  describe('setSidebarOpen', () => {
    it('sets the sidebar open state', () => {
      expect(useChatStore.getState().sidebarOpen).toBe(true);

      useChatStore.getState().setSidebarOpen(false);
      expect(useChatStore.getState().sidebarOpen).toBe(false);
    });
  });

  describe('setActiveSession', () => {
    it('sets the active session id', () => {
      const { createSession } = useChatStore.getState();
      const id1 = createSession();
      const id2 = useChatStore.getState().createSession();

      useChatStore.getState().setActiveSession(id1);
      expect(useChatStore.getState().activeSessionId).toBe(id1);

      useChatStore.getState().setActiveSession(id2);
      expect(useChatStore.getState().activeSessionId).toBe(id2);
    });

    it('allows setting to null', () => {
      const { createSession } = useChatStore.getState();
      createSession();

      useChatStore.getState().setActiveSession(null);
      expect(useChatStore.getState().activeSessionId).toBeNull();
    });
  });

  describe('clearSession', () => {
    it('clears all messages from a session', () => {
      const { createSession } = useChatStore.getState();
      const sessionId = createSession();

      useChatStore.getState().addMessage(sessionId, { role: 'user', content: 'msg1' });
      useChatStore.getState().addMessage(sessionId, { role: 'assistant', content: 'msg2' });

      useChatStore.getState().clearSession(sessionId);

      expect(useChatStore.getState().messages[sessionId]).toHaveLength(0);
    });

    it('resets messageCount and preview on the session', () => {
      const { createSession } = useChatStore.getState();
      const sessionId = createSession();

      useChatStore.getState().addMessage(sessionId, { role: 'user', content: 'some message' });
      useChatStore.getState().clearSession(sessionId);

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session?.messageCount).toBe(0);
      expect(session?.preview).toBe('');
    });
  });

  describe('getSessionMessages', () => {
    it('returns messages for the given session', () => {
      const { createSession } = useChatStore.getState();
      const sessionId = createSession();

      useChatStore.getState().addMessage(sessionId, { role: 'user', content: 'hello' });

      const messages = useChatStore.getState().getSessionMessages(sessionId);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('hello');
    });

    it('returns empty array for non-existent session', () => {
      const messages = useChatStore.getState().getSessionMessages('nonexistent');
      expect(messages).toEqual([]);
    });
  });

  // ==========================================================================
  // Utility: getGreetingTime
  // ==========================================================================

  describe('getGreetingTime', () => {
    it('returns morning, afternoon, or evening based on current hour', () => {
      const result = getGreetingTime();
      expect(['morning', 'afternoon', 'evening']).toContain(result);
    });
  });
});
