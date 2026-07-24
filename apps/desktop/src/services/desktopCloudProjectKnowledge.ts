import {
  createManagedCloudProjectKnowledgeClient,
  type ManagedCloudProjectKnowledgeFile,
} from '@agiworkforce/cloud-contracts';
import { WEB_APP_URL } from '../api/config';
import { cloudFetch, getAuthHeaders } from '../api/cloudApi';
import { guardedFetch } from '../lib/egressGuard';
import { assertManagedCloudBoundary, captureManagedCloudBoundary } from './managedCloudBoundary';

const client = createManagedCloudProjectKnowledgeClient({
  baseUrl: WEB_APP_URL,
  sourceSurface: 'desktop',
  getHeaders: async () => ({
    ...(await getAuthHeaders()),
    'X-AGI-Surface': 'desktop',
  }),
  fetchImpl: cloudFetch,
  // The signed storage URL contains no AGI credential. Keeping the upload
  // behind guardedFetch preserves Desktop's explicit egress policy.
  uploadFetchImpl: (input, init) => guardedFetch(input, init),
});

export const desktopCloudProjectKnowledge = {
  async list(projectId: string): Promise<ManagedCloudProjectKnowledgeFile[]> {
    const boundary = captureManagedCloudBoundary('Cloud project knowledge');
    const files = await client.list(projectId);
    assertManagedCloudBoundary(boundary);
    return files;
  },

  async upload(projectId: string, file: File): Promise<ManagedCloudProjectKnowledgeFile> {
    const boundary = captureManagedCloudBoundary('Cloud project knowledge upload');
    const uploaded = await client.upload(projectId, file);
    assertManagedCloudBoundary(boundary);
    return uploaded;
  },

  async remove(projectId: string, fileId: string): Promise<void> {
    const boundary = captureManagedCloudBoundary('Cloud project knowledge deletion');
    await client.remove(projectId, fileId);
    assertManagedCloudBoundary(boundary);
  },
};
