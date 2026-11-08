import { describe, expect, it } from 'vitest';
import { adjacentChatId, chatIdFromPath, visibleChatIds } from '../lib/adjacent-chat';

const chats = [
  { id: 'older', updatedAt: '2026-11-01T00:00:00.000Z' },
  { id: 'newest', updatedAt: '2026-11-03T00:00:00.000Z' },
  { id: 'middle', updatedAt: '2026-11-02T00:00:00.000Z' },
  { id: 'archived', updatedAt: '2026-11-04T00:00:00.000Z', isArchived: true },
  { id: 'scratch', updatedAt: '2026-11-05T00:00:00.000Z', isTemporary: true },
];

describe('the chat list History steps through', () => {
  it('keeps the sidebar order and leaves archived and temporary chats out', () => {
    expect(visibleChatIds(chats)).toEqual(['newest', 'middle', 'older']);
  });

  it('reads a conversation from the public chat path', () => {
    expect(chatIdFromPath('/chat/middle')).toBe('middle');
    expect(chatIdFromPath('/chat/a%20b')).toBe('a b');
    expect(chatIdFromPath('/chat')).toBeNull();
    expect(chatIdFromPath('/chat/projects/p1')).toBeNull();
  });

  it('steps to the older chat and the newer chat', () => {
    const ids = visibleChatIds(chats);

    expect(adjacentChatId(ids, 'middle', 'previous')).toBe('older');
    expect(adjacentChatId(ids, 'middle', 'next')).toBe('newest');
    expect(adjacentChatId(ids, 'newest', 'next')).toBeNull();
    expect(adjacentChatId(ids, 'older', 'previous')).toBeNull();
    expect(adjacentChatId(ids, null, 'next')).toBe('newest');
    expect(adjacentChatId(ids, null, 'previous')).toBeNull();
  });
});
