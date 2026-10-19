import { z } from 'zod';
import { api } from '@/services/api';

const ARTIFACT_INDEX_PATH = '/api/artifacts/index';

const IndexedArtifactSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  messageId: z.string(),
  title: z.string().nullable(),
  type: z.string(),
  createdAt: z.string(),
});

const IndexResponseSchema = z.object({ artifacts: z.array(IndexedArtifactSchema).default([]) });

export type IndexedProjectArtifact = z.infer<typeof IndexedArtifactSchema>;

export async function fetchProjectArtifacts(
  projectId: string,
  signal?: AbortSignal,
): Promise<IndexedProjectArtifact[]> {
  const response = await api.get<unknown>(
    `${ARTIFACT_INDEX_PATH}?projectId=${encodeURIComponent(projectId)}`,
    signal ? { signal } : undefined,
  );
  return IndexResponseSchema.parse(response).artifacts;
}
