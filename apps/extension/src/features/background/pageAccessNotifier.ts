const WEB_PAGE_URLS = ['http://*/*', 'https://*/*'];
const TOP_DOCUMENT = { frameId: 0 };

export async function notifyPageAccessChanged(affects: (origin: string) => boolean): Promise<void> {
  const tabs = await chrome.tabs.query({ url: WEB_PAGE_URLS }).catch(() => []);
  await Promise.all(
    tabs.map(async (tab) => {
      if (typeof tab.id !== 'number' || typeof tab.url !== 'string') return;
      let origin: string;
      try {
        origin = new URL(tab.url).origin;
      } catch {
        return;
      }
      if (!affects(origin)) return;
      await chrome.tabs
        .sendMessage(tab.id, { type: 'PAGE_ACCESS_CHANGED' }, TOP_DOCUMENT)
        .catch(() => undefined);
    }),
  );
}

export function changedOrigins(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
): ReadonlySet<string> {
  const changed = new Set<string>();
  for (const origin of before) if (!after.has(origin)) changed.add(origin);
  for (const origin of after) if (!before.has(origin)) changed.add(origin);
  return changed;
}
