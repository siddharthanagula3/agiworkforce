import { MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH } from '@agiworkforce/cloud-contracts';
import {
  parseCallerBrowserContext,
  type CallerBrowserContext,
} from '../cloud-bridge/callerBrowserContext';

export type TaskTabScope = readonly (CallerBrowserContext & {
  documentId: string;
  closeable: boolean;
})[];

export function parseTaskTabScope(value: unknown, current?: CallerBrowserContext): TaskTabScope {
  if (
    !Array.isArray(value) ||
    !value.length ||
    JSON.stringify(value).length > MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH
  )
    throw new Error('The saved task tabs are invalid or exceed their context budget.');
  const seen = new Set<number>();
  let windowId: number | undefined;
  const tabs = value.map((raw) => {
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      typeof raw.closeable !== 'boolean' ||
      Object.keys(raw).some(
        (key) => !['tabId', 'windowId', 'url', 'documentId', 'closeable'].includes(key),
      )
    )
      throw new Error('A saved task tab is invalid.');
    const context = parseCallerBrowserContext({
      tabId: raw.tabId,
      windowId: raw.windowId,
      url: raw.url,
      documentId: raw.documentId,
    });
    if (
      !context.documentId ||
      seen.has(context.tabId) ||
      (windowId !== undefined && windowId !== context.windowId)
    )
      throw new Error(
        'Saved task tabs are duplicated, missing a document, or belong to different windows.',
      );
    seen.add(context.tabId);
    windowId = context.windowId;
    return Object.freeze({ ...context, documentId: context.documentId, closeable: raw.closeable });
  });
  if (
    current &&
    !tabs.some(
      (tab) =>
        tab.tabId === current.tabId &&
        tab.windowId === current.windowId &&
        tab.url === current.url &&
        tab.documentId === current.documentId,
    )
  )
    throw new Error('The current browser document does not belong to the saved task tabs.');
  return Object.freeze(tabs);
}
