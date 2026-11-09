import {
  ManagedCloudProjectKnowledgeReindexResponseSchema,
  createManagedCloudProjectKnowledgeClient,
  managedCloudProjectKnowledgeFilePath,
  type ManagedCloudProjectKnowledgeFile,
} from '@agiworkforce/cloud-contracts';
import type { ProjectKnowledgeIndexState } from '@agiworkforce/types';
import { getCsrfToken } from '@/lib/client/csrf';

interface UploadProjectKnowledgeFileInput {
  projectId: string;
  file: File;
  onProgress?: (progress: number) => void;
  onNotice?: (notice: string) => void;
}

function createWebProjectKnowledgeClient() {
  return createManagedCloudProjectKnowledgeClient({
    sourceSurface: 'web',
    decorateMutationHeaders: async (headers) => {
      headers.set('x-csrf-token', await getCsrfToken());
      return Object.fromEntries(headers.entries());
    },
  });
}

export async function listProjectKnowledgeFiles(
  projectId: string,
): Promise<ManagedCloudProjectKnowledgeFile[]> {
  return createWebProjectKnowledgeClient().list(projectId);
}

export async function removeProjectKnowledgeFile(projectId: string, fileId: string): Promise<void> {
  return createWebProjectKnowledgeClient().remove(projectId, fileId);
}

export async function reindexProjectKnowledgeFile(
  projectId: string,
  fileId: string,
): Promise<ProjectKnowledgeIndexState | null> {
  const response = await fetch(
    `${managedCloudProjectKnowledgeFilePath(projectId, fileId)}/reindex`,
    {
      method: 'POST',
      headers: { 'x-csrf-token': await getCsrfToken() },
      credentials: 'include',
    },
  );
  if (!response.ok) throw new Error(`Reindex failed (${response.status})`);
  return ManagedCloudProjectKnowledgeReindexResponseSchema.parse(await response.json()).indexing;
}

export async function uploadProjectKnowledgeFile({
  projectId,
  file,
  onProgress,
  onNotice,
}: UploadProjectKnowledgeFileInput): Promise<ManagedCloudProjectKnowledgeFile> {
  const client = createWebProjectKnowledgeClient();
  onProgress?.(0);
  const registered = await client.upload(projectId, file, { onNotice });
  onProgress?.(100);
  return registered;
}
