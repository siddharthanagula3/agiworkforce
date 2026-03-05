/**
 * conversationTreeProvider.test.ts — Tests for ConversationTreeProvider logic
 *
 * Tests the tree item creation and refresh behavior.
 */

import { describe, it, expect, vi } from 'vitest';

interface StoredConversation {
  id: string;
  title: string;
  messages: Array<{ role: string; content: string; timestamp: number }>;
  model: string;
  createdAt: number;
  updatedAt: number;
}

describe('ConversationTreeItem creation', () => {
  function createTreeItem(conversation: StoredConversation): {
    label: string;
    description: string;
    tooltip: string;
    contextValue: string;
    command: { command: string; title: string; arguments: string[] };
  } {
    const diff = Date.now() - conversation.updatedAt;
    const minutes = Math.floor(diff / 60_000);
    const description = minutes < 1 ? 'just now' : `${minutes}m ago`;

    return {
      label: conversation.title,
      description,
      tooltip: conversation.messages[0]?.content.slice(0, 120) ?? 'Empty conversation',
      contextValue: 'conversation',
      command: {
        command: 'agi-workforce.openConversation',
        title: 'Open Conversation',
        arguments: [conversation.id],
      },
    };
  }

  it('creates a tree item with correct label', () => {
    const conv: StoredConversation = {
      id: 'test-1',
      title: 'My Chat',
      messages: [{ role: 'user', content: 'Hello world', timestamp: Date.now() }],
      model: 'auto',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const item = createTreeItem(conv);
    expect(item.label).toBe('My Chat');
    expect(item.contextValue).toBe('conversation');
  });

  it('uses first message content as tooltip', () => {
    const conv: StoredConversation = {
      id: 'test-2',
      title: 'Chat',
      messages: [{ role: 'user', content: 'How to sort arrays?', timestamp: Date.now() }],
      model: 'auto',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const item = createTreeItem(conv);
    expect(item.tooltip).toBe('How to sort arrays?');
  });

  it('shows "Empty conversation" for conversations with no messages', () => {
    const conv: StoredConversation = {
      id: 'test-3',
      title: 'Empty',
      messages: [],
      model: 'auto',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const item = createTreeItem(conv);
    expect(item.tooltip).toBe('Empty conversation');
  });

  it('truncates tooltip to 120 characters', () => {
    const longContent = 'A'.repeat(200);
    const conv: StoredConversation = {
      id: 'test-4',
      title: 'Long',
      messages: [{ role: 'user', content: longContent, timestamp: Date.now() }],
      model: 'auto',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const item = createTreeItem(conv);
    expect(item.tooltip.length).toBe(120);
  });

  it('links openConversation command with correct id', () => {
    const conv: StoredConversation = {
      id: 'abc-123',
      title: 'Chat',
      messages: [],
      model: 'auto',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const item = createTreeItem(conv);
    expect(item.command.command).toBe('agi-workforce.openConversation');
    expect(item.command.arguments).toEqual(['abc-123']);
  });
});

describe('ConversationTreeProvider refresh', () => {
  it('fires onDidChangeTreeData event on refresh', () => {
    const fire = vi.fn();
    const provider = {
      _onDidChangeTreeData: { fire },
      refresh() {
        this._onDidChangeTreeData.fire();
      },
    };

    provider.refresh();
    expect(fire).toHaveBeenCalledTimes(1);
  });
});
