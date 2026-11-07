import {
  MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH,
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_PAGE_MAX_ITEMS,
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_CURSOR_MAX_CHARS,
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
    super(
      `This site ${operation} could not be confirmed. It may have taken effect. Refresh to check before trying again.`,
    );
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

export interface PublishedSitePage {
  sites: ManagedCloudPublishedArtifact[];
  workspaceMemberCount: number | null;
  nextCursor: string | null | undefined;
}

const PublishedSitePageResponseSchema = ManagedCloudPublishedArtifactListResponseSchema.extend({
  artifacts: ManagedCloudPublishedArtifactListResponseSchema.shape.artifacts.max(
    MANAGED_CLOUD_PUBLISHED_ARTIFACT_PAGE_MAX_ITEMS,
  ),
});

export async function listPublishedSitesPage(
  cursor: string | null = null,
  signal?: AbortSignal,
  authority?: SiteRequestAuthority,
): Promise<PublishedSitePage> {
  if (
    cursor !== null &&
    (cursor.length === 0 || cursor.length > MANAGED_CLOUD_PUBLISHED_ARTIFACT_CURSOR_MAX_CHARS)
  ) {
    throw new Error('Invalid publication page cursor');
  }
  const path =
    cursor === null
      ? MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH
      : `${MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH}?${new URLSearchParams({ cursor })}`;
  const raw = await api.get<unknown>(path, authority ? requestOptions(authority) : { signal });
  authority?.assertCurrent();
  const body = PublishedSitePageResponseSchema.parse(raw);
  if (cursor !== null && (!body.pageInfo || body.pageInfo.nextCursor === cursor)) {
    throw new Error('The next publication page could not be confirmed. Refresh to try again.');
  }
  // FlatList keys must be unique within the single accepted page.
  if (new Set(body.artifacts.map((site) => site.token)).size !== body.artifacts.length) {
    throw new Error('Publication page contains duplicate sites');
  }
  return {
    sites: body.artifacts,
    workspaceMemberCount: body.workspace?.memberCount ?? null,
    nextCursor: body.pageInfo?.nextCursor,
  };
}

export async function readPublishedSite(
  token: string,
  signal?: AbortSignal,
  authority?: SiteRequestAuthority,
): Promise<{
  site: ManagedCloudPublishedArtifact;
  workspace: ManagedCloudPublishedArtifactDetailResponse['workspace'];
} | null> {
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
    ? await api.patch<unknown>(
        managedCloudPublishedArtifactPath(token),
        requestedChange,
        requestOptions(authority),
      )
    : await api.patch<unknown>(managedCloudPublishedArtifactPath(token), requestedChange);
  authority?.assertCurrent();
  const receipt = ManagedCloudPublishedArtifactUpdateReceiptSchema.safeParse(raw);
  if (
    !receipt.success ||
    receipt.data.token !== token ||
    (requestedChange.visibility !== undefined &&
      receipt.data.visibility !== requestedChange.visibility)
  ) {
    throw new SiteMutationUncertainError('update');
  }
  return receipt.data;
}

export async function unpublishSite(
  token: string,
  authority?: SiteRequestAuthority,
): Promise<void> {
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
    await api.get<unknown>(
      managedCloudPublishedArtifactVersionsPath(token),
      authority ? requestOptions(authority) : { signal },
    ),
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
    await api.get<unknown>(
      managedCloudPublishedArtifactDataPath(token),
      authority ? requestOptions(authority) : { signal },
    ),
  );
}

export async function clearSiteSharedData(
  token: string,
  authority?: SiteRequestAuthority,
): Promise<number> {
  return ManagedCloudPublishedArtifactDataClearResponseSchema.parse(
    authority
      ? await api.delete<unknown>(
          managedCloudPublishedArtifactDataPath(token),
          requestOptions(authority),
        )
      : await api.delete<unknown>(managedCloudPublishedArtifactDataPath(token)),
  ).cleared;
}

export async function deleteSiteAndData(
  token: string,
  hasSharedData: boolean,
  authority?: SiteRequestAuthority,
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
