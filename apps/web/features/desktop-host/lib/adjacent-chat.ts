/**
 * The chat list History > Previous Chat and Next Chat step through.
 *
 * The order matches the sidebar: newest update first, with archived and
 * temporary chats left out. Previous moves toward an older chat. Next moves
 * toward a newer one.
 */

export interface ChatListEntry {
  id: string;
  updatedAt: string;
  isArchived?: boolean;
  isTemporary?: boolean;
}

const CHAT_SECTION_PREFIXES = [
  '/chat/images',
  '/chat/projects',
  '/chat/artifacts',
  '/chat/library',
  '/chat/sites',
  '/chat/finance',
  '/chat/health',
  '/chat/schedules',
  '/chat/live-artifacts',
  '/chat/agents',
  '/chat/customize',
  '/chat/study',
] as const;

export type ChatStep = 'previous' | 'next';

export function visibleChatIds(entries: readonly ChatListEntry[]): string[] {
  return entries
    .filter((entry) => !entry.isArchived && !entry.isTemporary)
    .slice()
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map((entry) => entry.id);
}

export function chatIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith('/chat/')) return null;
  if (
    CHAT_SECTION_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ) {
    return null;
  }
  const segment = pathname.slice('/chat/'.length).split('/')[0];
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function adjacentChatId(
  ids: readonly string[],
  currentId: string | null,
  step: ChatStep,
): string | null {
  if (ids.length === 0) return null;
  const index = currentId === null ? -1 : ids.indexOf(currentId);
  if (index < 0) return step === 'next' ? (ids[0] ?? null) : null;
  const nextIndex = step === 'previous' ? index + 1 : index - 1;
  if (nextIndex < 0 || nextIndex >= ids.length) return null;
  return ids[nextIndex] ?? null;
}
