import {
  createManagedCloudChatAttachmentsClient,
  type ManagedCloudChatAttachment,
} from '@agiworkforce/cloud-contracts';
import { WEB_APP_URL } from '../api/config';
import { accountBoundCloudFetch, getAuthHeaders } from '../api/cloudApi';
import { guardedFetch } from '../lib/egressGuard';
import {
  assertManagedCloudBoundary,
  captureManagedCloudBoundary,
  subscribeManagedCloudBoundary,
} from './managedCloudBoundary';

export async function uploadDesktopCloudAttachments(
  files: File[],
  signal?: AbortSignal,
): Promise<ManagedCloudChatAttachment[]> {
  const boundary = captureManagedCloudBoundary('Managed Cloud attachments');
  const assertBoundary = () => assertManagedCloudBoundary(boundary);
  const boundaryController = new AbortController();
  const abortForBoundaryChange = () =>
    boundaryController.abort(
      new DOMException('The Managed Cloud account changed during attachment upload.', 'AbortError'),
    );
  const unsubscribeBoundary = subscribeManagedCloudBoundary(boundary, abortForBoundaryChange);
  const abortFromCaller = () => boundaryController.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });
  const client = createManagedCloudChatAttachmentsClient({
    baseUrl: WEB_APP_URL,
    getHeaders: async () => {
      assertBoundary();
      const headers = await getAuthHeaders(boundary.accountId);
      assertBoundary();
      return headers;
    },
    // Resolve the live same-account credential again at the final transport
    // boundary. An account/session switch fails before a queued presign or
    // completion body can leave the renderer.
    fetchImpl: (input, init) =>
      accountBoundCloudFetch(input, init, boundary.accountId, assertBoundary),
    // The presigned destination is intentionally supplied by the authenticated
    // AGI endpoint. It receives only the selected bytes and signed upload
    // headers; the account Bearer token is never attached to that URL.
    uploadFetchImpl: (input, init) => {
      assertBoundary();
      return guardedFetch(input, init).then((response) => {
        assertBoundary();
        return response;
      });
    },
  });
  try {
    const attachments = await client.upload(files, { signal: boundaryController.signal });
    assertBoundary();
    return attachments;
  } finally {
    signal?.removeEventListener('abort', abortFromCaller);
    unsubscribeBoundary();
  }
}
