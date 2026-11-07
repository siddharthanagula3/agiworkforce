import {
  MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH,
  ManagedCloudPublishedArtifactDataClearResponseSchema,
  ManagedCloudPublishedArtifactDataResponseSchema,
  ManagedCloudPublishedArtifactDetailResponseSchema,
  ManagedCloudPublishedArtifactListResponseSchema,
  ManagedCloudPublishedArtifactUpdateReceiptSchema,
  ManagedCloudPublishedArtifactDeleteReceiptSchema,
  ManagedCloudPublishedArtifactRestoreReceiptSchema,
  ManagedCloudPublishedArtifactVersionListResponseSchema,
  managedCloudPublishedArtifactDataPath,
  managedCloudPublishedArtifactPath,
  managedCloudPublishedArtifactVersionPath,
  managedCloudPublishedArtifactVersionsPath,
  type ManagedCloudPublishedArtifact,
  type ManagedCloudPublishedArtifactDataResponse,
  type ManagedCloudPublishedArtifactDetailResponse,
  type ManagedCloudPublishedArtifactUpdateRequest,
  type ManagedCloudPublishedArtifactUpdateResponse,
  type ManagedCloudPublishedArtifactVersion,
} from '@agiworkforce/cloud-contracts';
import { api, ApiHttpError } from '@/services/api';
import type { CloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';

export class SiteMutationUncertainError extends Error {
  constructor(operation: 'update' | 'unpublish' | 'version restore') {
    super(`This site ${operation} could not be confirmed. It may have taken effect. Refresh to check before trying again.`);
    this.name = 'SiteMutationUncertainError';
  }
}

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

export async function readPublishedSite(
  token: string,
  signal?: AbortSignal,
  authority?: SiteRequestAuthority,
): Promise<{ site: ManagedCloudPublishedArtifact; workspace: ManagedCloudPublishedArtifactDetailResponse['workspace'] } | null> {
  try {
    const raw = await api.get<unknown>(
      managedCloudPublishedArtifactPath(token),
      authority ? requestOptions(authority) : { signal },
    );
    authority?.assertCurrent();
    const body = ManagedCloudPublishedArtifactDetailResponseSchema.parse(raw);
    if (body.artifact.token !== token) throw new Error('Site details were not confirmed');
    return { site: body.artifact, workspace: body.workspace };
  } catch (error) {
    authority?.assertCurrent();
    if (error instanceof ApiHttpError && error.status === 404) return null;
    throw error;
  }
}

export async function updatePublishedSite(
  token: string,
  change: ManagedCloudPublishedArtifactUpdateRequest,
  authority?: SiteRequestAuthority,
): Promise<ManagedCloudPublishedArtifactUpdateResponse> {
  const requestedChange = { ...change };
  const raw = authority
    ? await api.patch<unknown>(managedCloudPublishedArtifactPath(token), requestedChange, requestOptions(authority))
    : await api.patch<unknown>(managedCloudPublishedArtifactPath(token), requestedChange);
  authority?.assertCurrent();
  const receipt = ManagedCloudPublishedArtifactUpdateReceiptSchema.safeParse(raw);
  if (
    !receipt.success || receipt.data.token !== token ||
    (requestedChange.visibility !== undefined && receipt.data.visibility !== requestedChange.visibility)
  ) {
    throw new SiteMutationUncertainError('update');
  }
  return receipt.data;
}

export async function unpublishSite(token: string, authority?: SiteRequestAuthority): Promise<void> {
  const raw = authority
    ? await api.delete<unknown>(managedCloudPublishedArtifactPath(token), requestOptions(authority))
    : await api.delete<unknown>(managedCloudPublishedArtifactPath(token));
  authority?.assertCurrent();
  const receipt = ManagedCloudPublishedArtifactDeleteReceiptSchema.safeParse(raw);
  if (!receipt.success || receipt.data.token !== token) {
    throw new SiteMutationUncertainError('unpublish');
  }
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
  const token = site.token;
  const path = managedCloudPublishedArtifactVersionPath(token, version);
  const raw = authority
    ? await api.post<unknown>(path, undefined, requestOptions(authority))
    : await api.post<unknown>(path);
  authority?.assertCurrent();
  const receipt = ManagedCloudPublishedArtifactRestoreReceiptSchema.safeParse(raw);
  if (!receipt.success || receipt.data.token !== token) {
    throw new SiteMutationUncertainError('version restore');
  }
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
