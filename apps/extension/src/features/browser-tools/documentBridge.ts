import { UUID_PATTERN } from '../../lib/uuid';
import { TOOL_CALL_ID_MAX_LENGTH, WEB_PAGE_URL_MAX_LENGTH } from '@agiworkforce/cloud-contracts';
export interface PageDocumentReference {
  tabId: number;
  url: string;
  documentId: string;
}

export interface FormObservationReference extends PageDocumentReference {
  formSnapshotId: string;
}

export function isPageDocumentId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= TOOL_CALL_ID_MAX_LENGTH &&
    ![...value].some(
      (character) => character.charCodeAt(0) <= 0x20 || character.charCodeAt(0) === 0x7f,
    )
  );
}

export function parseFormObservationReference(value: unknown): FormObservationReference | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).some(
      (key) => !['tabId', 'url', 'documentId', 'formSnapshotId'].includes(key),
    ) ||
    typeof raw['tabId'] !== 'number' ||
    !Number.isSafeInteger(raw['tabId']) ||
    raw['tabId'] < 0 ||
    typeof raw['url'] !== 'string' ||
    raw['url'].length > WEB_PAGE_URL_MAX_LENGTH ||
    !isPageDocumentId(raw['documentId']) ||
    typeof raw['formSnapshotId'] !== 'string' ||
    !UUID_PATTERN.test(raw['formSnapshotId'])
  )
    return null;
  try {
    const url = new URL(raw['url']);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  } catch {
    return null;
  }
  return {
    tabId: raw['tabId'],
    url: raw['url'],
    documentId: raw['documentId'],
    formSnapshotId: raw['formSnapshotId'],
  };
}

export async function readPageDocument(
  tabId: number,
  expectedUrl: string,
  expectedDocumentId?: string,
): Promise<PageDocumentReference> {
  const [observed] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => location.href,
  });
  if (
    !isPageDocumentId(observed?.documentId) ||
    observed.result !== expectedUrl ||
    (expectedDocumentId !== undefined && observed.documentId !== expectedDocumentId)
  )
    throw new Error('The page changed while it was being read.');
  return { tabId, url: expectedUrl, documentId: observed.documentId };
}

export async function sendPageDocumentMessage(
  reference: PageDocumentReference,
  message: unknown,
  injectIfMissing = false,
): Promise<unknown> {
  const options = { documentId: reference.documentId };
  try {
    return await chrome.tabs.sendMessage(reference.tabId, message, options);
  } catch (error) {
    if (
      !injectIfMissing ||
      !(error instanceof Error) ||
      !/receiving end does not exist|could not establish connection/i.test(error.message)
    )
      throw error;
    await chrome.scripting.executeScript({
      target: { tabId: reference.tabId, documentIds: [reference.documentId] },
      files: ['src/content.js'],
    });
    return chrome.tabs.sendMessage(reference.tabId, message, options);
  }
}
