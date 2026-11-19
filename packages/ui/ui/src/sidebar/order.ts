import { toSafeDate } from './temporal';
import type { SidebarSession } from './types';

export function newestFirst(a: SidebarSession, b: SidebarSession): number {
  return toSafeDate(b.updatedAt).getTime() - toSafeDate(a.updatedAt).getTime();
}

/**
 * The chats in the order the rail lists them by default: pinned first, then
 * the rest, each newest first, with archived chats left out.
 */
export function sidebarSessionOrder(sessions: readonly SidebarSession[]): SidebarSession[] {
  const live = sessions.filter((session) => !session.archived);
  return [
    ...live.filter((session) => session.pinned).sort(newestFirst),
    ...live.filter((session) => !session.pinned).sort(newestFirst),
  ];
}

/**
 * The chat above or below `currentId` in the rail, which is where Previous Chat
 * and Next Chat go. Answers null at either end, or when `currentId` is not in
 * the list, so the move never jumps somewhere the person did not ask for.
 */
export function adjacentSidebarSessionId(
  sessions: readonly SidebarSession[],
  currentId: string | null,
  direction: 'previous' | 'next',
): string | null {
  if (currentId === null) return null;
  const order = sidebarSessionOrder(sessions);
  const index = order.findIndex((session) => session.id === currentId);
  if (index === -1) return null;
  return order[index + (direction === 'next' ? 1 : -1)]?.id ?? null;
}
