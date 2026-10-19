import {
  MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH,
  ManagedCloudPublishedArtifactDataClearResponseSchema,
  ManagedCloudPublishedArtifactDataResponseSchema,
  ManagedCloudPublishedArtifactListResponseSchema,
  ManagedCloudPublishedArtifactUpdateResponseSchema,
  ManagedCloudPublishedArtifactVersionDetailSchema,
  ManagedCloudPublishedArtifactVersionListResponseSchema,
  managedCloudPublishedArtifactDataPath,
  managedCloudPublishedArtifactPath,
  managedCloudPublishedArtifactVersionPath,
  managedCloudPublishedArtifactVersionsPath,
  type ManagedCloudPublishedArtifact,
  type ManagedCloudPublishedArtifactDataResponse,
  type ManagedCloudPublishedArtifactUpdateRequest,
  type ManagedCloudPublishedArtifactUpdateResponse,
  type ManagedCloudPublishedArtifactVersion,
} from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';

export interface PublishedSiteList {
  sites: ManagedCloudPublishedArtifact[];
  workspaceMemberCount: number | null;
}

export async function listPublishedSites(signal?: AbortSignal): Promise<PublishedSiteList> {
  const body = ManagedCloudPublishedArtifactListResponseSchema.parse(
    await api.get<unknown>(MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH, { signal }),
  );
  return {
    sites: [...body.artifacts].sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    ),
    workspaceMemberCount: body.workspace?.memberCount ?? null,
  };
}

export async function updatePublishedSite(
  token: string,
  change: ManagedCloudPublishedArtifactUpdateRequest,
): Promise<ManagedCloudPublishedArtifactUpdateResponse> {
  return ManagedCloudPublishedArtifactUpdateResponseSchema.parse(
    await api.patch<unknown>(managedCloudPublishedArtifactPath(token), change),
  );
}

export async function unpublishSite(token: string): Promise<void> {
  await api.delete<unknown>(managedCloudPublishedArtifactPath(token));
}

export async function listSiteVersions(
  token: string,
  signal?: AbortSignal,
): Promise<ManagedCloudPublishedArtifactVersion[]> {
  return ManagedCloudPublishedArtifactVersionListResponseSchema.parse(
    await api.get<unknown>(managedCloudPublishedArtifactVersionsPath(token), { signal }),
  ).versions;
}

export async function republishSiteVersion(
  site: Pick<ManagedCloudPublishedArtifact, 'token' | 'artifactId'>,
  version: number,
): Promise<void> {
  const detail = ManagedCloudPublishedArtifactVersionDetailSchema.parse(
    await api.get<unknown>(managedCloudPublishedArtifactVersionPath(site.token, version)),
  );
  await api.post<unknown>(MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH, {
    artifactId: site.artifactId,
    title: detail.title,
    kind: detail.kind,
    ...(detail.language ? { language: detail.language } : {}),
    content: detail.content,
  });
}

export async function readSiteData(
  token: string,
  signal?: AbortSignal,
): Promise<ManagedCloudPublishedArtifactDataResponse> {
  return ManagedCloudPublishedArtifactDataResponseSchema.parse(
    await api.get<unknown>(managedCloudPublishedArtifactDataPath(token), { signal }),
  );
}

export async function clearSiteSharedData(token: string): Promise<number> {
  return ManagedCloudPublishedArtifactDataClearResponseSchema.parse(
    await api.delete<unknown>(managedCloudPublishedArtifactDataPath(token)),
  ).cleared;
}

export async function deleteSiteAndData(token: string, hasSharedData: boolean): Promise<void> {
  if (hasSharedData) await clearSiteSharedData(token);
  await unpublishSite(token);
}

export function siteName(site: Pick<ManagedCloudPublishedArtifact, 'title'>): string {
  return site.title.trim() || 'Untitled site';
}

export const SITE_VISIBILITY_LABELS: Record<ManagedCloudPublishedArtifact['visibility'], string> = {
  public: 'Anyone with the link',
  organization: 'Only your workspace',
  invited: 'Invited people',
};

export function siteSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
