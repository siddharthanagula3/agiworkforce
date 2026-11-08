/**
 * Whether this window is showing the chats it has opened as tabs.
 *
 * The list is the same order Previous Tab and Next Tab walk.
 */

type ChatTabStrip = {
  visible: boolean;
  tabs: readonly string[];
  closed: readonly string[];
};

let strip: ChatTabStrip = { visible: false, tabs: [], closed: [] };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeChatTabs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getChatTabs(): ChatTabStrip {
  return strip;
}

export function setChatTabIds(tabs: readonly string[]): void {
  if (strip.tabs.length === tabs.length && strip.tabs.every((id, index) => id === tabs[index])) {
    return;
  }
  strip = { ...strip, tabs: [...tabs] };
  emit();
}

export function rememberChatTab(id: string): void {
  if (strip.tabs.includes(id)) return;
  strip = { ...strip, tabs: [...strip.tabs, id] };
  emit();
}

export function closeChatTab(id: string): void {
  if (!strip.tabs.includes(id)) return;
  strip = {
    ...strip,
    tabs: strip.tabs.filter((tab) => tab !== id),
    closed: [...strip.closed, id],
  };
  emit();
}

export function closeOtherChatTabs(activeId: string | null): void {
  if (!activeId || !strip.tabs.includes(activeId)) return;
  const removed = strip.tabs.filter((id) => id !== activeId);
  if (removed.length === 0) return;
  strip = {
    ...strip,
    tabs: strip.tabs.filter((id) => id === activeId),
    closed: [...strip.closed, ...removed],
  };
  emit();
}

export function closeChatTabsToTheRight(activeId: string | null): void {
  if (!activeId) return;
  const index = strip.tabs.indexOf(activeId);
  if (index < 0) return;
  const removed = strip.tabs.slice(index + 1);
  if (removed.length === 0) return;
  strip = {
    ...strip,
    tabs: strip.tabs.slice(0, index + 1),
    closed: [...strip.closed, ...removed],
  };
  emit();
}

/** Puts the most recently closed chat back on the list. */
export function reopenClosedChatTab(): string | null {
  const id = strip.closed[strip.closed.length - 1];
  if (!id) return null;
  strip = {
    ...strip,
    closed: strip.closed.slice(0, -1),
    tabs: strip.tabs.includes(id) ? strip.tabs : [...strip.tabs, id],
    visible: true,
  };
  emit();
  return id;
}

export function toggleChatTabsVisible(): void {
  strip = { ...strip, visible: !strip.visible };
  emit();
}

export function resetChatTabs(): void {
  strip = { visible: false, tabs: [], closed: [] };
  emit();
}
