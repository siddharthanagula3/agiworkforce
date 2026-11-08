export interface PageDocumentReference {
  tabId: number;
  url: string;
  documentId: string;
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
    !observed?.documentId ||
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
