import {
  createManagedCloudProjectKnowledgeClient,
  type ManagedCloudProjectKnowledgeFile,
} from '@agiworkforce/cloud-contracts';
import { getCsrfToken } from '@/lib/client/csrf';

interface UploadProjectKnowledgeFileInput {
  projectId: string;
  file: File;
  onProgress?: (progress: number) => void;
}

/**
 * Browser adapter for the shared managed-project knowledge transaction.
 * Web contributes only its CSRF/session transport; validation, checksum,
 * presign, upload, registration, and response verification stay shared with
 * Desktop and Mobile.
 */
export async function uploadProjectKnowledgeFile({
  projectId,
  file,
  onProgress,
}: UploadProjectKnowledgeFileInput): Promise<ManagedCloudProjectKnowledgeFile> {
  const client = createManagedCloudProjectKnowledgeClient({
    sourceSurface: 'web',
    decorateMutationHeaders: async (headers) => {
      headers.set('x-csrf-token', await getCsrfToken());
      return Object.fromEntries(headers.entries());
    },
  });
  onProgress?.(0);
  const registered = await client.upload(projectId, file);
  onProgress?.(100);
  return registered;
}
