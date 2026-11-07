import {
  MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH,
  ManagedCloudPublishedArtifactDataClearResponseSchema,
  ManagedCloudPublishedArtifactDataResponseSchema,
  ManagedCloudPublishedArtifactListResponseSchema,
  ManagedCloudPublishedArtifactUpdateResponseSchema,
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
import type { CloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';

export interface SiteRequestAuthority {
  accountEpoch: CloudAccountEpoch | null;
  signal: AbortSignal;
  assertCurrent: () => void;
}

function requestOptions(authority: SiteRequestAuthority) {
  authority.assertCurrent();
  return {
    accountEpoch: authority.accountEpoch,
    signal: authority.signal,
    auth401Recovery: 'caller-owned' as const,
  };
}

export interface PublishedSiteList {
  sites: ManagedCloudPublishedArtifact[];
  workspaceMemberCount: number | null;
}

export async function listPublishedSites(signal?: AbortSignal, authority?: SiteRequestAuthority): Promise<PublishedSiteList> {
  const body = ManagedCloudPublishedArtifactListResponseSchema.parse(
    await api.get<unknown>(MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH, authority ? requestOptions(authority) : { signal }),
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
  authority?: SiteRequestAuthority,
): Promise<ManagedCloudPublishedArtifactUpdateResponse> {
  return ManagedCloudPublishedArtifactUpdateResponseSchema.parse(
    (authority
      ? await api.patch<unknown>(managedCloudPublishedArtifactPath(token), change, requestOptions(authority))
      : await api.patch<unknown>(managedCloudPublishedArtifactPath(token), change)),
  );
}

export async function unpublishSite(token: string, authority?: SiteRequestAuthority): Promise<void> {
  if (authority) await api.delete<unknown>(managedCloudPublishedArtifactPath(token), requestOptions(authority));
  else await api.delete<unknown>(managedCloudPublishedArtifactPath(token));
}

export async function listSiteVersions(
  token: string,
  signal?: AbortSignal,
  authority?: SiteRequestAuthority,
): Promise<ManagedCloudPublishedArtifactVersion[]> {
  return ManagedCloudPublishedArtifactVersionListResponseSchema.parse(
    await api.get<unknown>(managedCloudPublishedArtifactVersionsPath(token), authority ? requestOptions(authority) : { signal }),
  ).versions;
}

export async function republishSiteVersion(
  site: Pick<ManagedCloudPublishedArtifact, 'token' | 'artifactId'>,
  version: number,
  authority?: SiteRequestAuthority,
): Promise<void> {
  const path = managedCloudPublishedArtifactVersionPath(site.token, version);
  if (authority) await api.post<unknown>(path, undefined, requestOptions(authority));
  else await api.post<unknown>(path);
}

export async function readSiteData(
  token: string,
  signal?: AbortSignal,
  authority?: SiteRequestAuthority,
): Promise<ManagedCloudPublishedArtifactDataResponse> {
  return ManagedCloudPublishedArtifactDataResponseSchema.parse(
    await api.get<unknown>(managedCloudPublishedArtifactDataPath(token), authority ? requestOptions(authority) : { signal }),
  );
}

export async function clearSiteSharedData(token: string, authority?: SiteRequestAuthority): Promise<number> {
  return ManagedCloudPublishedArtifactDataClearResponseSchema.parse(
    (authority
      ? await api.delete<unknown>(managedCloudPublishedArtifactDataPath(token), requestOptions(authority))
      : await api.delete<unknown>(managedCloudPublishedArtifactDataPath(token))),
  ).cleared;
}

export async function deleteSiteAndData(
  token: string, hasSharedData: boolean, authority?: SiteRequestAuthority,
): Promise<void> {
  if (hasSharedData) await clearSiteSharedData(token, authority);
  await unpublishSite(token, authority);
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
