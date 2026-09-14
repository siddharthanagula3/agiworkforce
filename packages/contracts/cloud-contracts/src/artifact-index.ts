import { z } from 'zod';

export const MANAGED_CLOUD_ARTIFACT_INDEX_PATH = '/api/artifacts/index';
export const MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH = '/api/artifacts/publish';

/**
 * Metadata only. The index deliberately stores no `content`: an artifact's
 * bytes live in the message that produced it and are re-derived under the same
 * deterministic id, so a reader that wants content must fetch the source
 * message and derive it with `@agiworkforce/artifacts`.
 */
export const ManagedCloudArtifactIndexEntrySchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  title: z.string().nullable(),
  type: z.string(),
  language: z.string().nullable(),
  projectId: z.string().nullable(),
  createdAt: z.string().min(1),
});
export type ManagedCloudArtifactIndexEntry = z.infer<typeof ManagedCloudArtifactIndexEntrySchema>;

export const ManagedCloudArtifactIndexResponseSchema = z.object({
  artifacts: z.array(ManagedCloudArtifactIndexEntrySchema),
});
export type ManagedCloudArtifactIndexResponse = z.infer<
  typeof ManagedCloudArtifactIndexResponseSchema
>;

export const ManagedCloudArtifactIndexQuerySchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  projectId: z.string().min(1).optional(),
});
export type ManagedCloudArtifactIndexQuery = z.infer<typeof ManagedCloudArtifactIndexQuerySchema>;

export const ManagedCloudPublishedArtifactSchema = z.object({
  token: z.string().min(1),
  artifactId: z.string().min(1),
  title: z.string(),
  kind: z.string(),
  language: z.string().nullable(),
  contentChars: z.number().int().nonnegative(),
  visibility: z.string(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  shareUrl: z.string().min(1),
  sandboxed: z.boolean(),
});
export type ManagedCloudPublishedArtifact = z.infer<typeof ManagedCloudPublishedArtifactSchema>;

export const ManagedCloudPublishedArtifactListResponseSchema = z.object({
  artifacts: z.array(ManagedCloudPublishedArtifactSchema),
});
export type ManagedCloudPublishedArtifactListResponse = z.infer<
  typeof ManagedCloudPublishedArtifactListResponseSchema
>;

export function managedCloudArtifactIndexQueryString(
  query: ManagedCloudArtifactIndexQuery = {},
): string {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.projectId !== undefined) params.set('projectId', query.projectId);
  return params.size > 0 ? `?${params.toString()}` : '';
}
