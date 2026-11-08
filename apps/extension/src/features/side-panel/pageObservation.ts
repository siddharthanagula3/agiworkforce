import { readPageDocument, sendPageDocumentMessage } from '../browser-tools/documentBridge';
import type { SidePanelChatMessage } from './chat-state';

export function formObservationReference(capture: {
  source: { tabId?: number; url: string };
  documentId?: string;
  formSnapshotId?: string;
}): SidePanelChatMessage['browserObservation'] {
  if (typeof capture.source.tabId !== 'number' || !capture.documentId || !capture.formSnapshotId)
    return undefined;
  return {
    tabId: capture.source.tabId,
    url: capture.source.url,
    documentId: capture.documentId,
    formSnapshotId: capture.formSnapshotId,
  };
}

export async function readTabObservation(
  tabId: number,
  expectedUrl: string,
): Promise<{
  text: string;
  truncated: boolean;
  documentId: string;
  formSnapshotId?: string;
}> {
  const reference = await readPageDocument(tabId, expectedUrl);
  const response = (await sendPageDocumentMessage(
    reference,
    { type: 'GET_PAGE_OBSERVATION', pageUrl: expectedUrl },
    true,
  )) as {
    success?: boolean;
    text?: unknown;
    truncated?: boolean;
    formSnapshotId?: unknown;
    error?: string;
  };
  if (response?.success !== true || typeof response.text !== 'string')
    throw new Error(response?.error ?? 'The page did not return readable context.');
  await readPageDocument(tabId, expectedUrl, reference.documentId);
  return {
    text: response.text,
    truncated: response.truncated === true,
    documentId: reference.documentId,
    ...(typeof response.formSnapshotId === 'string'
      ? { formSnapshotId: response.formSnapshotId }
      : {}),
  };
}
