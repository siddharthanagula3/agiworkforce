import { z } from 'zod';
import {
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_CURSOR_MAX_CHARS,
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_PAGE_MAX_ITEMS,
} from './artifact-index';

export const ARTIFACTS_SHARED_WITH_ME_PATH = '/api/artifacts/shared-with-me';

export function artifactsSharedWithMePath(cursor: string | null = null): string {
  return cursor === null
    ? ARTIFACTS_SHARED_WITH_ME_PATH
    : `${ARTIFACTS_SHARED_WITH_ME_PATH}?${new URLSearchParams({ cursor })}`;
}

export const ArtifactSharedWithMeSchema = z.object({
  token: z.string().min(1),
  title: z.string(),
  kind: z.string(),
  updatedAt: z.string(),
});
export type ArtifactSharedWithMe = z.infer<typeof ArtifactSharedWithMeSchema>;

export const ArtifactsSharedWithMeResponseSchema = z.object({
  items: z.array(ArtifactSharedWithMeSchema).max(MANAGED_CLOUD_PUBLISHED_ARTIFACT_PAGE_MAX_ITEMS),
  hasMore: z.boolean(),
  nextCursor: z.string().min(1).max(MANAGED_CLOUD_PUBLISHED_ARTIFACT_CURSOR_MAX_CHARS).nullable(),
  emailVerified: z.boolean(),
});
export type ArtifactsSharedWithMeResponse = z.infer<typeof ArtifactsSharedWithMeResponseSchema>;
