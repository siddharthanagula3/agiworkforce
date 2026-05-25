/**
 * Chat Store Tests (features/chat/stores/chat-store)
 *
 * Tests for the feature-level chat store that handles sessions, messages,
 * streaming state, and Supabase persistence.
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';

import { useChatStore, getGreetingTime } from './chat-store';

describe('ChatStore (features/chat)', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    // Reset store to initial state
    useChatStore.getState().reset();

    // Advance past any debounce window from previous tests (500ms guard)
    vi.advanceTimersByTime(1500);
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
      expect(state!.sessions[0]!.id!).toBe(id);
      expect(state!.sessions[0]!.title!).toBe('New Chat');
      expect(state!.sessions[0]!.messageCount!).toBe(0);
      expect(state!.sessions[0]!.preview!).toBe('');
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
      vi.advanceTimersByTime(1500); // bypass debounce
      const id2 = useChatStore.getState().createSession();

      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
      expect(id1).not.toBe(id2);
    });

    it('prepends (unshifts) new session so most recent is first', () => {
      const { createSession } = useChatStore.getState();
      const id1 = createSession();
      vi.advanceTimersByTime(1500); // bypass debounce
      const id2 = useChatStore.getState().createSession();

      const { sessions } = useChatStore.getState();
      expect(sessions![0]!.id!).toBe(id2);
      expect(sessions![1]!.id!).toBe(id1);
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
      vi.advanceTimersByTime(1500); // bypass debounce
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
      expect(messages![0]!.id!).toBe(msgId);
      expect(messages![0]!.content!).toBe('Hello');
      expect(messages![0]!.role!).toBe('user');
      expect(messages![0]!.sessionId!).toBe(sessionId);
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

      const msg = useChatStore!.getState().messages[sessionId]!.find((m) => m.id === msgId)!;
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
      let msg = useChatStore!.getState().messages[sessionId]!.find((m) => m.id === msgId)!;
      expect(msg?.isStreaming).toBe(true);

      useChatStore.getState().setStreaming(sessionId, msgId, false);
      msg = useChatStore!.getState().messages[sessionId]!.find((m) => m.id === msgId)!;
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

      const msg = useChatStore!.getState().messages[sessionId]!.find((m) => m.id === msgId)!;
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
      vi.advanceTimersByTime(1500); // bypass debounce
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
      expect(messages![0]!.content!).toBe('hello');
    });

    it('returns empty array for non-existent session', () => {
      const messages = useChatStore.getState().getSessionMessages('nonexistent');
      expect(messages).toEqual([]);
    });
  });

  // ==========================================================================
  // addMessage — Truncation & Auto-Title (M35)
  // ==========================================================================

  describe('addMessage truncation and auto-title', () => {
    it('truncates preview to 100 chars for long content', () => {
      const { createSession } = useChatStore.getState();
      const sessionId = createSession();

      const longContent = 'x'.repeat(150);
      useChatStore.getState().addMessage(sessionId, { role: 'user', content: longContent });

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session?.preview).toHaveLength(100);
      expect(session?.preview).toBe('x'.repeat(100));
    });

    it('truncates title to 50 chars with "..." for long first user message', () => {
      const { createSession } = useChatStore.getState();
      const sessionId = createSession();

      const longContent = 'a'.repeat(80);
      useChatStore.getState().addMessage(sessionId, { role: 'user', content: longContent });

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session?.title).toBe('a'.repeat(50) + '...');
      expect(session?.title).toHaveLength(53);
    });

    it('does not append "..." when first user message is exactly 50 chars', () => {
      const { createSession } = useChatStore.getState();
      const sessionId = createSession();

      const exactContent = 'b'.repeat(50);
      useChatStore.getState().addMessage(sessionId, { role: 'user', content: exactContent });

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session?.title).toBe('b'.repeat(50));
    });

    it('does NOT auto-title when session.title is not "New Chat"', () => {
      const { createSession } = useChatStore.getState();
      const sessionId = createSession();

      // Manually rename the session before adding message
      useChatStore.getState().renameSession(sessionId, 'My Custom Title');

      useChatStore.getState().addMessage(sessionId, { role: 'user', content: 'Some new content' });

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session?.title).toBe('My Custom Title');
    });

    it('does NOT auto-title for assistant messages', () => {
      const { createSession } = useChatStore.getState();
      const sessionId = createSession();

      useChatStore.getState().addMessage(sessionId, {
        role: 'assistant',
        content: 'This is an assistant response',
      });

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session?.title).toBe('New Chat');
    });
  });

  // ==========================================================================
  // Persistence stubs (C2)
  //
  // loadSessionsFromDb / loadMessagesFromDb / saveMessageToDb / saveSessionToDb
  // are currently no-op TODO stubs pending /api/chat/* route implementation.
  // These tests verify the stub contract: methods resolve without throwing.
  // ==========================================================================

  describe('Persistence stubs', () => {
    describe('loadSessionsFromDb', () => {
      it('resolves without throwing and sets dbLoaded=true', async () => {
        await expect(useChatStore.getState().loadSessionsFromDb('u1')).resolves.toBeUndefined();

        expect(useChatStore.getState().dbLoaded).toBe(true);
      });
    });

    describe('loadMessagesFromDb', () => {
      it('resolves without throwing', async () => {
        await expect(useChatStore.getState().loadMessagesFromDb('s1')).resolves.toBeUndefined();
      });
    });

    describe('saveMessageToDb', () => {
      it('resolves without throwing', async () => {
        const message = {
          id: 'msg-1',
          sessionId: 's1',
          role: 'user' as const,
          content: 'hello',
          createdAt: new Date(),
          metadata: { model: 'test' },
        };

        await expect(
          useChatStore.getState().saveMessageToDb(message, 'u1'),
        ).resolves.toBeUndefined();
      });
    });

    describe('saveSessionToDb', () => {
      it('resolves without throwing', async () => {
        const session = {
          id: 'sess-1',
          title: 'My Chat',
          createdAt: new Date(),
          updatedAt: new Date(),
          preview: 'hello there',
          messageCount: 5,
          userId: 'u1',
        };

        await expect(
          useChatStore.getState().saveSessionToDb(session, 'u1'),
        ).resolves.toBeUndefined();
      });
    });
  });

  // ==========================================================================
  // Utility: getGreetingTime
  // ==========================================================================

  describe('getGreetingTime', () => {
    it('returns "morning" for hours before 12', () => {
      vi.setSystemTime(new Date('2024-01-01T09:00:00'));
      expect(getGreetingTime()).toBe('morning');
    });

    it('returns "afternoon" for hours 12–16', () => {
      vi.setSystemTime(new Date('2024-01-01T14:00:00'));
      expect(getGreetingTime()).toBe('afternoon');
    });

    it('returns "evening" for hours 17 and later', () => {
      vi.setSystemTime(new Date('2024-01-01T18:00:00'));
      expect(getGreetingTime()).toBe('evening');
    });
  });
});
