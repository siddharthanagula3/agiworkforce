import { WEB_PAGE_URL_MAX_LENGTH } from '@agiworkforce/cloud-contracts';
import type { BrowserContextTabReference } from '../../types';
import { isPageDocumentId, readPageDocument } from '../browser-tools/documentBridge';

export type CallerBrowserContext = Pick<
  BrowserContextTabReference,
  'tabId' | 'windowId' | 'url' | 'documentId'
>;

export function parseCallerBrowserContext(value: unknown): CallerBrowserContext {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('The saved browser page identity is invalid.');
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).some((key) => !['tabId', 'windowId', 'url', 'documentId'].includes(key)) ||
    typeof raw['tabId'] !== 'number' ||
    !Number.isSafeInteger(raw['tabId']) ||
    raw['tabId'] < 0 ||
    typeof raw['windowId'] !== 'number' ||
    !Number.isSafeInteger(raw['windowId']) ||
    raw['windowId'] < 0 ||
    typeof raw['url'] !== 'string' ||
    raw['url'].length > WEB_PAGE_URL_MAX_LENGTH ||
    (raw['documentId'] !== undefined && !isPageDocumentId(raw['documentId']))
  )
    throw new Error('The saved browser page identity is invalid.');
  let url: URL;
  try {
    url = new URL(raw['url']);
  } catch {
    throw new Error('The saved browser page address is invalid.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('The saved browser page address is invalid.');
  return Object.freeze({
    tabId: raw['tabId'],
    windowId: raw['windowId'],
    url: raw['url'],
    ...(typeof raw['documentId'] === 'string' ? { documentId: raw['documentId'] } : {}),
  });
}

export async function readCallerBrowserContext(
  value: CallerBrowserContext,
  assertCurrent: () => void,
): Promise<CallerBrowserContext> {
  const context = parseCallerBrowserContext(value);
  const assertTab = (tab: chrome.tabs.Tab) => {
    if (
      tab.id !== context.tabId ||
      tab.windowId !== context.windowId ||
      tab.url !== context.url ||
      tab.status === 'loading'
    )
      throw new Error('The original browser page changed. No browser action was repeated.');
  };
  assertCurrent();
  const first = await chrome.tabs.get(context.tabId);
  assertCurrent();
  assertTab(first);
  if (context.documentId !== undefined) {
    await readPageDocument(context.tabId, context.url, context.documentId);
    assertCurrent();
  }
  const last = await chrome.tabs.get(context.tabId);
  assertCurrent();
  assertTab(last);
  return context;
}

export async function captureCallerBrowserContext(
  source: Partial<Pick<BrowserContextTabReference, 'tabId' | 'windowId'>> &
    Pick<BrowserContextTabReference, 'url'>,
  documentId: string | undefined,
  assertCurrent: () => void,
  mayReadDocument = false,
): Promise<CallerBrowserContext> {
  const original = { ...source };
  if (typeof original.tabId !== 'number') throw new Error('The browser task has no original tab.');
  assertCurrent();
  const tab = await chrome.tabs.get(original.tabId);
  assertCurrent();
  if (
    tab.url !== original.url ||
    (original.windowId !== undefined && tab.windowId !== original.windowId) ||
    tab.status === 'loading'
  )
    throw new Error('The original browser page changed. No browser action was repeated.');
  if (documentId === undefined && mayReadDocument) {
    const observed = await readPageDocument(original.tabId, original.url);
    assertCurrent();
    documentId = observed.documentId;
  }
  return readCallerBrowserContext(
    {
      tabId: original.tabId,
      windowId: original.windowId ?? tab.windowId,
      url: original.url,
      ...(documentId !== undefined ? { documentId } : {}),
    },
    assertCurrent,
  );
}
