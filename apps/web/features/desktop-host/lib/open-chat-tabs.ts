/**
 * The chats this window has opened, in the order they were opened.
 *
 * Previous Tab and Next Tab walk that list. They do not wrap.
 */

export type TabStep = 'previous' | 'next';

export function tabsAfterOpen(tabs: readonly string[], id: string): string[] {
  return tabs.includes(id) ? [...tabs] : [...tabs, id];
}

export function adjacentTabId(
  tabs: readonly string[],
  activeId: string | null,
  step: TabStep,
): string | null {
  if (tabs.length < 2 || activeId === null) return null;
  const index = tabs.indexOf(activeId);
  if (index < 0) return null;
  const nextIndex = step === 'next' ? index + 1 : index - 1;
  if (nextIndex < 0 || nextIndex >= tabs.length) return null;
  return tabs[nextIndex] ?? null;
}
