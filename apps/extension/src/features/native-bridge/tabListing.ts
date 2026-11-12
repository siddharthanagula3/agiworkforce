import type { BrowserTabSummary } from '@agiworkforce/types';

export interface ListedTab {
  readonly id: number;
  readonly url: string;
  readonly title?: string;
}

/**
 * What a paired Desktop learns about one open tab. An approved site is listed
 * in full; any other tab is listed by its origin alone, with no title, path,
 * query or fragment, so a reset link or sign-in code in an address never
 * leaves the browser.
 */
export function desktopTabSummary(
  tab: ListedTab,
  active: boolean,
  approved: (origin: string) => boolean,
): BrowserTabSummary {
  const origin = new URL(tab.url).origin;
  return approved(origin)
    ? { tabId: tab.id, title: tab.title ?? '', url: tab.url, active }
    : { tabId: tab.id, title: '', url: origin, active };
}
