import {
  createManagedCloudChatAttachmentsClient,
  type ManagedCloudChatAttachment,
} from '@agiworkforce/cloud-contracts';
import { WEB_APP_URL } from '../api/config';
import { cloudFetch, getAuthHeaders } from '../api/cloudApi';
import { guardedFetch } from '../lib/egressGuard';
import { assertManagedCloudBoundary, captureManagedCloudBoundary } from './managedCloudBoundary';

const client = createManagedCloudChatAttachmentsClient({
  baseUrl: WEB_APP_URL,
  getHeaders: async () => getAuthHeaders(),
  fetchImpl: cloudFetch,
  // The presigned destination is intentionally supplied by the authenticated
  // AGI endpoint. It receives only the selected bytes and signed upload
  // headers; the account Bearer token is never attached to that URL.
  uploadFetchImpl: guardedFetch,
});

export async function uploadDesktopCloudAttachments(
  files: File[],
): Promise<ManagedCloudChatAttachment[]> {
  const boundary = captureManagedCloudBoundary('Managed Cloud attachments');
  const attachments = await client.upload(files);
  assertManagedCloudBoundary(boundary);
  return attachments;
}
