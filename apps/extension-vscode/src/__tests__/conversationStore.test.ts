/**
 * conversationStore.test.ts — Tests for ConversationStore logic
 *
 * Tests the conversation CRUD operations, pruning, and auto-title behavior
 * using the real ConversationStore with a mock ExtensionContext.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationStore } from '../storage/conversationStore';
import { sessionHistoryRelativeTime } from '../extension';
import { ExtensionContext } from './__mocks__/vscode';

describe('ConversationStore', () => {
  let store: ConversationStore;

  beforeEach(() => {
    const ctx = new ExtensionContext();
    store = new ConversationStore(ctx as unknown as import('vscode').ExtensionContext);
  });

  describe('create', () => {
    it('creates a conversation with a unique id', () => {
      const conv = store.create('Test Chat', 'gpt-5-pro');
      expect(conv.id).toBeTruthy();
      expect(conv.title).toBe('Test Chat');
      expect(conv.model).toBe('gpt-5-pro');
      expect(conv.messages).toEqual([]);
      expect(conv.createdAt).toBeGreaterThan(0);
      expect(conv.updatedAt).toBe(conv.createdAt);
    });

    it('creates conversations with different ids', () => {
      const conv1 = store.create('Chat 1', 'auto');
      const conv2 = store.create('Chat 2', 'auto');
      expect(conv1.id).not.toBe(conv2.id);
    });
  });

  describe('getAll', () => {
    it('returns empty array when no conversations exist', () => {
      expect(store.getAll()).toEqual([]);
    });

    it('returns conversations sorted by updatedAt descending', () => {
      const conv1 = store.create('Old', 'auto');
      conv1.updatedAt = 1000;
      store.save(conv1);

      const conv2 = store.create('New', 'auto');
      conv2.updatedAt = 2000;
      store.save(conv2);

      const all = store.getAll();
      expect(all[0].title).toBe('New');
      expect(all[1].title).toBe('Old');
    });
  });

  describe('get', () => {
    it('retrieves a conversation by id', () => {
      const created = store.create('My Chat', 'claude-opus-4.6');
      const found = store.get(created.id);
      expect(found).toBeDefined();
      expect(found?.title).toBe('My Chat');
    });

    it('returns undefined for non-existent id', () => {
      expect(store.get('nonexistent')).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('removes a conversation by id', () => {
      const conv = store.create('To Delete', 'auto');
      store.delete(conv.id);
      expect(store.get(conv.id)).toBeUndefined();
    });

    it('does not affect other conversations', () => {
      const conv1 = store.create('Keep', 'auto');
      const conv2 = store.create('Delete', 'auto');
      store.delete(conv2.id);
      expect(store.get(conv1.id)).toBeDefined();
    });
  });

  describe('addMessage', () => {
    it('adds a message to an existing conversation', () => {
      const conv = store.create('Chat', 'auto');
      store.addMessage(conv.id, {
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      });

      const updated = store.get(conv.id);
      expect(updated?.messages).toHaveLength(1);
      expect(updated?.messages[0].content).toBe('Hello');
    });

    it('does nothing when conversation id does not exist', () => {
      store.addMessage('nonexistent', {
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      });
      expect(store.getAll()).toHaveLength(0);
    });

    it('auto-titles from first user message when title is "New Chat"', () => {
      const conv = store.create('New Chat', 'auto');
      store.addMessage(conv.id, {
        role: 'user',
        content: 'How do I sort an array in JavaScript?',
        timestamp: Date.now(),
      });

      const updated = store.get(conv.id);
      expect(updated?.title).toBe('How do I sort an array in JavaScript?');
    });

    it('does not auto-title when title is not "New Chat"', () => {
      const conv = store.create('Custom Title', 'auto');
      store.addMessage(conv.id, {
        role: 'user',
        content: 'Some message',
        timestamp: Date.now(),
      });

      const updated = store.get(conv.id);
      expect(updated?.title).toBe('Custom Title');
    });

    it('truncates auto-title to 60 characters', () => {
      const conv = store.create('New Chat', 'auto');
      const longContent = 'A'.repeat(100);
      store.addMessage(conv.id, {
        role: 'user',
        content: longContent,
        timestamp: Date.now(),
      });

      const updated = store.get(conv.id);
      expect(updated?.title.length).toBe(60);
    });

    it('replaces newlines in auto-title with spaces', () => {
      const conv = store.create('New Chat', 'auto');
      store.addMessage(conv.id, {
        role: 'user',
        content: 'Line one\nLine two\nLine three',
        timestamp: Date.now(),
      });

      const updated = store.get(conv.id);
      expect(updated?.title).toBe('Line one Line two Line three');
    });

    it('does not auto-title from assistant messages', () => {
      const conv = store.create('New Chat', 'auto');
      store.addMessage(conv.id, {
        role: 'assistant',
        content: 'Hello user!',
        timestamp: Date.now(),
      });

      const updated = store.get(conv.id);
      expect(updated?.title).toBe('New Chat');
    });
  });

  describe('pruning', () => {
    it('prunes oldest conversations when exceeding MAX_CONVERSATIONS', () => {
      for (let i = 0; i < 55; i++) {
        const conv = store.create(`Chat ${i}`, 'auto');
        conv.updatedAt = i;
        store.save(conv);
      }

      expect(store.getAll().length).toBeLessThanOrEqual(50);
    });
  });

  describe('save / get persistence', () => {
    it('persists conversation via save() and retrieves it via get()', () => {
      const conv = store.create('Persisted Chat', 'gpt-5-pro');
      // Mutate and explicitly save
      conv.title = 'Updated Title';
      store.save(conv);

      const found = store.get(conv.id);
      expect(found).toBeDefined();
      expect(found?.title).toBe('Updated Title');
    });

    it('get() returns the same data that was saved', () => {
      const conv = store.create('Data Check', 'auto-balanced');
      conv.messages.push({ role: 'user', content: 'hello', timestamp: 1000 });
      store.save(conv);

      const loaded = store.get(conv.id);
      expect(loaded?.messages).toHaveLength(1);
      expect(loaded?.messages[0].content).toBe('hello');
    });
  });

  describe('delete', () => {
    it('delete() prevents get() from finding the removed conversation', () => {
      const conv = store.create('To Be Deleted', 'auto');
      store.delete(conv.id);
      expect(store.get(conv.id)).toBeUndefined();
    });

    it('delete() removes the item from getAll()', () => {
      const conv1 = store.create('Keep Me', 'auto');
      const conv2 = store.create('Remove Me', 'auto');
      store.delete(conv2.id);
      const ids = store.getAll().map((c) => c.id);
      expect(ids).toContain(conv1.id);
      expect(ids).not.toContain(conv2.id);
    });
  });

  describe('duplicate title handling', () => {
    it('creates two conversations with the same title successfully', () => {
      // create() does not enforce title uniqueness — callers are responsible
      const conv1 = store.create('Duplicate Title', 'auto');
      const conv2 = store.create('Duplicate Title', 'auto');
      // Both should exist with distinct ids
      expect(conv1.id).not.toBe(conv2.id);
      expect(store.get(conv1.id)?.title).toBe('Duplicate Title');
      expect(store.get(conv2.id)?.title).toBe('Duplicate Title');
    });

    it('getAll() includes both conversations with the same title', () => {
      store.create('Same Title', 'auto');
      store.create('Same Title', 'auto');
      const matches = store.getAll().filter((c) => c.title === 'Same Title');
      expect(matches.length).toBe(2);
    });
  });
});

describe('formatRelativeTime pattern', () => {
  function formatRelativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);
    const days = Math.floor(diff / 86_400_000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  it('shows "just now" for recent timestamps', () => {
    expect(formatRelativeTime(Date.now())).toBe('just now');
  });

  it('shows minutes for timestamps under an hour', () => {
    const fiveMinAgo = Date.now() - 5 * 60_000;
    expect(formatRelativeTime(fiveMinAgo)).toBe('5m ago');
  });

  it('shows hours for timestamps under a day', () => {
    const threeHoursAgo = Date.now() - 3 * 3_600_000;
    expect(formatRelativeTime(threeHoursAgo)).toBe('3h ago');
  });

  it('shows days for timestamps under a week', () => {
    const twoDaysAgo = Date.now() - 2 * 86_400_000;
    expect(formatRelativeTime(twoDaysAgo)).toBe('2d ago');
  });

  it('shows formatted date for timestamps over a week', () => {
    const twoWeeksAgo = Date.now() - 14 * 86_400_000;
    const result = formatRelativeTime(twoWeeksAgo);
    // Should be a date string, not a relative time
    expect(result).not.toContain('ago');
    expect(result).not.toBe('just now');
  });
});

describe('sessionHistoryRelativeTime (showSessionsHistory QuickPick — ref PNG 09)', () => {
  it('returns "just now" for timestamps within the last minute', () => {
    expect(sessionHistoryRelativeTime(Date.now())).toBe('just now');
    expect(sessionHistoryRelativeTime(Date.now() - 30_000)).toBe('just now');
  });

  it('returns "Xm ago" for timestamps within the last hour', () => {
    expect(sessionHistoryRelativeTime(Date.now() - 3 * 60_000)).toBe('3m ago');
    expect(sessionHistoryRelativeTime(Date.now() - 59 * 60_000)).toBe('59m ago');
  });

  it('returns "Xh ago" for timestamps within the last 24 hours', () => {
    expect(sessionHistoryRelativeTime(Date.now() - 2 * 3_600_000)).toBe('2h ago');
    expect(sessionHistoryRelativeTime(Date.now() - 23 * 3_600_000)).toBe('23h ago');
  });

  it('returns "Xd ago" for timestamps within the last 7 days', () => {
    expect(sessionHistoryRelativeTime(Date.now() - 1 * 86_400_000)).toBe('1d ago');
    expect(sessionHistoryRelativeTime(Date.now() - 6 * 86_400_000)).toBe('6d ago');
  });

  it('returns a locale date string for timestamps older than 7 days', () => {
    const twoWeeksAgo = Date.now() - 14 * 86_400_000;
    const result = sessionHistoryRelativeTime(twoWeeksAgo);
    expect(result).not.toContain('ago');
    expect(result).not.toBe('just now');
    expect(result.length).toBeGreaterThan(0);
  });

  it('boundary: exactly 1 minute ago shows "1m ago"', () => {
    expect(sessionHistoryRelativeTime(Date.now() - 60_000)).toBe('1m ago');
  });

  it('boundary: exactly 1 hour ago shows "1h ago"', () => {
    expect(sessionHistoryRelativeTime(Date.now() - 3_600_000)).toBe('1h ago');
  });

  it('boundary: exactly 1 day ago shows "1d ago"', () => {
    expect(sessionHistoryRelativeTime(Date.now() - 86_400_000)).toBe('1d ago');
  });
});
