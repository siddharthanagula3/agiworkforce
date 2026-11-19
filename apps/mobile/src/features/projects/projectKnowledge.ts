import {
  ManagedCloudProjectKnowledgeReindexResponseSchema,
  managedCloudProjectKnowledgeReindexPath,
} from '@agiworkforce/cloud-contracts';
import type { ProjectKnowledgeIndexState } from '@agiworkforce/types';
import { api } from '@/services/api';
import type { CloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';

export async function reindexProjectKnowledgeFile(
  projectId: string,
  fileId: string,
  accountEpoch: CloudAccountEpoch | null,
): Promise<ProjectKnowledgeIndexState | null | undefined> {
  const response = await api.post<unknown>(
    managedCloudProjectKnowledgeReindexPath(projectId, fileId),
    undefined,
    { accountEpoch },
  );
  return ManagedCloudProjectKnowledgeReindexResponseSchema.parse(response).indexing;
}
