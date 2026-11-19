import { describe, expect, it } from 'vitest';
import { adjacentSidebarSessionId, sidebarSessionOrder } from '../order';
import type { SidebarSession } from '../types';

function session(
  id: string,
  updatedAt: string,
  extra: Partial<SidebarSession> = {},
): SidebarSession {
  return { id, title: id, updatedAt, ...extra } as SidebarSession;
}

const SESSIONS: SidebarSession[] = [
  session('old', '2026-10-01T00:00:00.000Z'),
  session('pinned-old', '2026-09-01T00:00:00.000Z', { pinned: true }),
  session('newest', '2026-10-27T00:00:00.000Z'),
  session('archived', '2026-10-26T00:00:00.000Z', { archived: true }),
  session('pinned-new', '2026-10-20T00:00:00.000Z', { pinned: true }),
  session('middle', '2026-10-15T00:00:00.000Z'),
];

describe('the rail order', () => {
  it('lists pinned chats first, then the rest, each newest first, without archived chats', () => {
    expect(sidebarSessionOrder(SESSIONS).map((entry) => entry.id)).toEqual([
      'pinned-new',
      'pinned-old',
      'newest',
      'middle',
      'old',
    ]);
  });
});

describe('the chat above and below', () => {
  it('moves to the row below and the row above', () => {
    expect(adjacentSidebarSessionId(SESSIONS, 'pinned-old', 'next')).toBe('newest');
    expect(adjacentSidebarSessionId(SESSIONS, 'newest', 'previous')).toBe('pinned-old');
  });

  it('stops at either end instead of wrapping round', () => {
    expect(adjacentSidebarSessionId(SESSIONS, 'pinned-new', 'previous')).toBeNull();
    expect(adjacentSidebarSessionId(SESSIONS, 'old', 'next')).toBeNull();
  });

  it('goes nowhere from a chat the rail does not list, or from no chat', () => {
    expect(adjacentSidebarSessionId(SESSIONS, 'archived', 'next')).toBeNull();
    expect(adjacentSidebarSessionId(SESSIONS, 'missing', 'next')).toBeNull();
    expect(adjacentSidebarSessionId(SESSIONS, null, 'next')).toBeNull();
  });
});
