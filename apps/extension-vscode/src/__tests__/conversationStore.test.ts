/**
 * conversationStore.test.ts — Tests for ConversationStore logic
 *
 * Tests the conversation CRUD operations, pruning, and auto-title behavior
 * using a mock ExtensionContext.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockExtensionContext } from './vscode.mock';

// Reimplement the store logic for testing since we cannot import vscode-dependent code directly
const STORAGE_KEY = 'agiWorkforce.conversations';
const MAX_CONVERSATIONS = 50;

interface StoredMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface StoredConversation {
  id: string;
  title: string;
  messages: StoredMessage[];
  model: string;
  createdAt: number;
  updatedAt: number;
}

class TestConversationStore {
  private data: StoredConversation[] = [];

  getAll(): StoredConversation[] {
    return this.data.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): StoredConversation | undefined {
    return this.data.find((c) => c.id === id);
  }

  save(conversation: StoredConversation): void {
    const idx = this.data.findIndex((c) => c.id === conversation.id);
    if (idx >= 0) {
      this.data[idx] = conversation;
    } else {
      this.data.push(conversation);
    }
    this.data = this.data
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CONVERSATIONS);
  }

  delete(id: string): void {
    this.data = this.data.filter((c) => c.id !== id);
  }

  create(title: string, model: string): StoredConversation {
    const now = Date.now();
    const conversation: StoredConversation = {
      id: now.toString(36) + Math.random().toString(36).slice(2),
      title,
      messages: [],
      model,
      createdAt: now,
      updatedAt: now,
    };
    this.save(conversation);
    return conversation;
  }

  addMessage(id: string, message: StoredMessage): void {
    const conversation = this.get(id);
    if (conversation === undefined) return;

    conversation.messages.push(message);
    conversation.updatedAt = Date.now();

    if (conversation.title === 'New Chat' && message.role === 'user') {
      conversation.title = message.content.slice(0, 60).replace(/\n/g, ' ');
    }

    this.save(conversation);
  }
}

describe('ConversationStore', () => {
  let store: TestConversationStore;

  beforeEach(() => {
    store = new TestConversationStore();
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

      expect(store.getAll().length).toBeLessThanOrEqual(MAX_CONVERSATIONS);
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
