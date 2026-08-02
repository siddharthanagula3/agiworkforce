import {
  createManagedCloudProjectKnowledgeClient,
  type ManagedCloudProjectKnowledgeClient,
  type ManagedCloudProjectKnowledgeFile,
} from '@agiworkforce/cloud-contracts';
import { WEB_APP_URL } from '../api/config';
import { createManagedCloudRequestContext } from './managedCloudRequestContext';

function createKnowledgeClient(label: string) {
  const request = createManagedCloudRequestContext(label);
  const client: ManagedCloudProjectKnowledgeClient = createManagedCloudProjectKnowledgeClient({
    baseUrl: WEB_APP_URL,
    sourceSurface: 'desktop',
    getHeaders: () => request.getHeaders(),
    fetchImpl: request.fetch,
    uploadFetchImpl: request.fetchExternal,
  });
  return { client, request };
}

export const desktopCloudProjectKnowledge = {
  async list(projectId: string): Promise<ManagedCloudProjectKnowledgeFile[]> {
    const { client, request } = createKnowledgeClient('Cloud project knowledge');
    const files = await client.list(projectId);
    request.assertBoundary();
    return files;
  },

  async upload(projectId: string, file: File): Promise<ManagedCloudProjectKnowledgeFile> {
    const { client, request } = createKnowledgeClient('Cloud project knowledge upload');
    const uploaded = await client.upload(projectId, file);
    request.assertBoundary();
    return uploaded;
  },

  async remove(projectId: string, fileId: string): Promise<void> {
    const { client, request } = createKnowledgeClient('Cloud project knowledge deletion');
    await client.remove(projectId, fileId);
    request.assertBoundary();
  },
};
