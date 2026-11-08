import type { BrowserContextTabReference } from '../../types';

export const MAX_TAB_CLEANUP_SELECTION = 100;

export async function closeSelectedBrowserTabs(
  selection: readonly BrowserContextTabReference[],
  isCurrent: () => boolean,
) {
  if (selection.length > MAX_TAB_CLEANUP_SELECTION)
    throw new Error('Too many tabs were selected. Choose fewer tabs.');
  if (new Set(selection.map((tab) => tab.tabId)).size !== selection.length)
    throw new Error('The tab selection contains duplicate tabs.');
  const closed: number[] = [];
  const skipped: number[] = [];
  const failed: number[] = [];
  for (const [index, selected] of selection.entries()) {
    if (!isCurrent()) {
      skipped.push(...selection.slice(index).map((tab) => tab.tabId));
      break;
    }
    try {
      const current = await chrome.tabs.get(selected.tabId);
      if (
        !isCurrent() ||
        current.windowId !== selected.windowId ||
        current.url !== selected.url ||
        current.pendingUrl ||
        current.active ||
        current.pinned
      ) {
        skipped.push(selected.tabId);
        continue;
      }
      await chrome.tabs.remove(selected.tabId);
      closed.push(selected.tabId);
    } catch {
      failed.push(selected.tabId);
    }
  }
  return { closed, skipped, failed };
}
