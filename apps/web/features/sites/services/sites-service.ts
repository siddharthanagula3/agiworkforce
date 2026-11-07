import { z } from 'zod';
import {
  MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH,
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_PAGE_MAX_ITEMS,
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_VISIBILITIES,
  ManagedCloudPublishedArtifactDataClearResponseSchema,
  ManagedCloudPublishedArtifactDeleteReceiptSchema,
  ManagedCloudPublishedArtifactRestoreReceiptSchema,
  ManagedCloudPublishedArtifactDataResponseSchema,
  ManagedCloudPublishedArtifactListResponseSchema,
  ManagedCloudPublishedArtifactPageInfoSchema,
  ManagedCloudPublishedArtifactDetailResponseSchema,
  ManagedCloudPublishedArtifactSchema,
  ManagedCloudPublishedArtifactUpdateReceiptSchema,
  ManagedCloudPublishedArtifactVersionDetailSchema,
  ManagedCloudPublishedArtifactVersionListResponseSchema,
  ManagedCloudPublishedArtifactViewersResponseSchema,
  managedCloudPublishedArtifactDataPath,
  managedCloudPublishedArtifactPath,
  managedCloudPublishedArtifactVersionPath,
  managedCloudPublishedArtifactVersionsPath,
  managedCloudPublishedArtifactViewersPath,
  type ManagedCloudPublishedArtifactDataResponse,
  type ManagedCloudPublishedArtifactUpdateRequest,
  type ManagedCloudPublishedArtifactUpdateResponse,
  type ManagedCloudPublishedArtifactVersion,
  type ManagedCloudPublishedArtifactVersionDetail,
  type ManagedCloudPublishedArtifactViewer,
  type ManagedCloudPublishedArtifactViewerRequest,
  type ManagedCloudPublishedArtifactVisibility,
} from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';
import type { RequestAuthority } from '@/lib/identity/request-authority';

export const SITES_PATH = '/chat/sites';

export function sitePath(token: string): string {
  return `${SITES_PATH}/${encodeURIComponent(token)}`;
}

export function siteVisitPath(token: string): string {
  return `/shared-artifact/${encodeURIComponent(token)}`;
}

export function siteEditPath(site: Pick<PublishedSite, 'conversationId' | 'artifactId'>) {
  if (!site.conversationId) return null;
  const query = new URLSearchParams({ artifact: site.artifactId });
  return `/chat/${encodeURIComponent(site.conversationId)}?${query.toString()}`;
}

const PublishedSiteSchema = ManagedCloudPublishedArtifactSchema.extend({
  kind: z.enum(['html', 'react', 'svg', 'mermaid', 'markdown', 'text', 'code']),
  shareUrl: z.string().url(),
  visibility: z.enum(MANAGED_CLOUD_PUBLISHED_ARTIFACT_VISIBILITIES),
});

const PublishedSiteListResponseSchema = ManagedCloudPublishedArtifactListResponseSchema.extend({
  artifacts: z.array(PublishedSiteSchema),
});

export type PublishedSite = z.infer<typeof PublishedSiteSchema>;
export type SiteVisibility = ManagedCloudPublishedArtifactVisibility;
export type SiteData = ManagedCloudPublishedArtifactDataResponse;

export interface PublishedSiteList {
  sites: PublishedSite[];
  workspace: { memberCount: number } | null;
}

async function withPublicationAuthority<T>(
  authority: Pick<RequestAuthority, 'assertCurrent'> | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  authority?.assertCurrent();
  try {
    const result = await operation();
    authority?.assertCurrent();
    return result;
  } catch (error) {
    authority?.assertCurrent();
    throw error;
  }
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string } | string;
  };
  const message =
    typeof body.error === 'string'
      ? body.error
      : typeof body.error?.message === 'string'
        ? body.error.message
        : fallback;
  return new Error(message);
}

export async function listPublishedSites(
  signal?: AbortSignal,
  authority?: RequestAuthority,
): Promise<PublishedSiteList> {
  return withPublicationAuthority(authority, async () => {
    const response = await (authority?.fetch ?? fetch)(MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH, {
      credentials: 'include',
      signal,
    });
    authority?.assertCurrent();
    if (!response.ok) {
      throw await responseError(response, 'Failed to load published artifacts');
    }
    const raw: unknown = await response.json();
    authority?.assertCurrent();
    const body = PublishedSiteListResponseSchema.parse(raw);
    return { sites: body.artifacts, workspace: body.workspace };
  });
}

const PublishedSitePageResponseSchema = PublishedSiteListResponseSchema.extend({
  artifacts: z.array(PublishedSiteSchema).max(MANAGED_CLOUD_PUBLISHED_ARTIFACT_PAGE_MAX_ITEMS),
  pageInfo: ManagedCloudPublishedArtifactPageInfoSchema,
});
const PublishedSiteDetailResponseSchema = ManagedCloudPublishedArtifactDetailResponseSchema.extend({
  artifact: PublishedSiteSchema,
});

export interface PublishedSitePage extends PublishedSiteList {
  nextCursor: string | null;
}

export async function listPublishedSitesPage(
  cursor: string | null = null,
  signal?: AbortSignal,
  authority?: RequestAuthority,
): Promise<PublishedSitePage> {
  return withPublicationAuthority(authority, async () => {
    const path =
      cursor === null
        ? MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH
        : `${MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH}?${new URLSearchParams({ cursor })}`;
    const response = await (authority?.fetch ?? fetch)(path, { credentials: 'include', signal });
    authority?.assertCurrent();
    if (!response.ok) throw await responseError(response, 'Failed to load published artifacts');
    const raw: unknown = await response.json();
    authority?.assertCurrent();
    const body = PublishedSitePageResponseSchema.parse(raw);
    if (cursor !== null && body.pageInfo.nextCursor === cursor) {
      throw new Error('The next publication page could not be confirmed. Refresh to try again.');
    }
    return {
      sites: body.artifacts,
      workspace: body.workspace,
      nextCursor: body.pageInfo.nextCursor,
    };
  });
}

export async function readPublishedSite(
  token: string,
  signal?: AbortSignal,
  authority?: RequestAuthority,
): Promise<{ site: PublishedSite; workspace: PublishedSiteList['workspace'] } | null> {
  return withPublicationAuthority(authority, async () => {
    const response = await (authority?.fetch ?? fetch)(managedCloudPublishedArtifactPath(token), {
      credentials: 'include',
      signal,
    });
    authority?.assertCurrent();
    if (response.status === 404) return null;
    if (!response.ok) throw await responseError(response, 'Failed to load this site');
    const raw: unknown = await response.json();
    authority?.assertCurrent();
    const body = PublishedSiteDetailResponseSchema.parse(raw);
    if (body.artifact.token !== token) throw new Error('Site details were not confirmed');
    return { site: body.artifact, workspace: body.workspace };
  });
}

export async function listPublishedArtifactVersions(
  token: string,
  signal?: AbortSignal,
  authority?: Pick<RequestAuthority, 'assertCurrent' | 'fetch'>,
): Promise<ManagedCloudPublishedArtifactVersion[]> {
  return withPublicationAuthority(authority, async () => {
    const response = await (authority?.fetch ?? fetch)(
      managedCloudPublishedArtifactVersionsPath(token),
      {
        credentials: 'include',
        signal,
      },
    );
    authority?.assertCurrent();
    if (!response.ok) {
      throw await responseError(response, 'Failed to load the publish history');
    }
    const raw: unknown = await response.json();
    authority?.assertCurrent();
    return ManagedCloudPublishedArtifactVersionListResponseSchema.parse(raw).versions;
  });
}

export async function readPublishedSiteVersion(
  token: string,
  version: number,
  signal?: AbortSignal,
): Promise<ManagedCloudPublishedArtifactVersionDetail> {
  const response = await fetch(managedCloudPublishedArtifactVersionPath(token, version), {
    credentials: 'include',
    signal,
  });
  if (!response.ok) {
    throw await responseError(response, 'Failed to read that published version');
  }
  return ManagedCloudPublishedArtifactVersionDetailSchema.parse(await response.json());
}

export async function republishArtifactVersion(
  artifact: Pick<PublishedSite, 'token' | 'artifactId'>,
  version: number,
  authority?: Pick<RequestAuthority, 'assertCurrent' | 'fetch'>,
): Promise<void> {
  const token = artifact.token;
  return withPublicationAuthority(authority, async () => {
    const headers = await addCsrfHeaders();
    authority?.assertCurrent();
    const response = await (authority?.fetch ?? fetch)(
      managedCloudPublishedArtifactVersionPath(token, version),
      {
        method: 'POST',
        credentials: 'include',
        headers,
      },
    );
    authority?.assertCurrent();
    if (!response.ok) {
      throw await responseError(response, 'Failed to put that version live');
    }
    const raw: unknown = await response.json().catch(() => null);
    authority?.assertCurrent();
    const receipt = ManagedCloudPublishedArtifactRestoreReceiptSchema.safeParse(raw);
    if (!receipt.success || receipt.data.token !== token) {
      throw new Error(
        'This version restore could not be confirmed. It may have taken effect. Refresh to check before trying again.',
      );
    }
  });
}

export async function unpublishArtifact(
  token: string,
  authority?: RequestAuthority,
): Promise<void> {
  return withPublicationAuthority(authority, async () => {
    const headers = await addCsrfHeaders();
    authority?.assertCurrent();
    const response = await (authority?.fetch ?? fetch)(managedCloudPublishedArtifactPath(token), {
      method: 'DELETE',
      credentials: 'include',
      headers,
    });
    authority?.assertCurrent();
    if (!response.ok) {
      throw await responseError(response, 'Failed to unpublish artifact');
    }
    const raw: unknown = await response.json().catch(() => null);
    authority?.assertCurrent();
    const receipt = ManagedCloudPublishedArtifactDeleteReceiptSchema.safeParse(raw);
    if (!receipt.success || receipt.data.token !== token) {
      throw new Error(
        'This unpublish could not be confirmed. It may have taken effect. Refresh to check before trying again.',
      );
    }
  });
}

export async function updatePublishedSite(
  token: string,
  change: ManagedCloudPublishedArtifactUpdateRequest,
): Promise<ManagedCloudPublishedArtifactUpdateResponse> {
  const requestedChange = { ...change };
  const body = JSON.stringify(requestedChange);
  const response = await fetch(managedCloudPublishedArtifactPath(token), {
    method: 'PATCH',
    credentials: 'include',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body,
  });
  if (!response.ok) {
    throw await responseError(
      response,
      requestedChange.title !== undefined
        ? 'Failed to rename this site'
        : 'Failed to change who can open this',
    );
  }
  const raw: unknown = await response.json().catch(() => null);
  const receipt = ManagedCloudPublishedArtifactUpdateReceiptSchema.safeParse(raw);
  if (
    !receipt.success ||
    receipt.data.token !== token ||
    (requestedChange.visibility !== undefined &&
      receipt.data.visibility !== requestedChange.visibility)
  ) {
    throw new Error(
      'This site update could not be confirmed. It may have taken effect. Refresh to check before trying again.',
    );
  }
  return receipt.data;
}

export async function readPublishedSiteData(
  token: string,
  signal?: AbortSignal,
  authority?: Pick<RequestAuthority, 'assertCurrent' | 'fetch'>,
): Promise<SiteData> {
  return withPublicationAuthority(authority, async () => {
    const response = await (authority?.fetch ?? fetch)(
      managedCloudPublishedArtifactDataPath(token),
      {
        credentials: 'include',
        signal,
      },
    );
    authority?.assertCurrent();
    if (!response.ok) throw await responseError(response, "Failed to load this site's data");
    const raw: unknown = await response.json();
    authority?.assertCurrent();
    return ManagedCloudPublishedArtifactDataResponseSchema.parse(raw);
  });
}

export async function clearPublishedSiteSharedData(
  token: string,
  authority?: Pick<RequestAuthority, 'assertCurrent' | 'fetch'>,
): Promise<number> {
  return withPublicationAuthority(authority, async () => {
    const headers = await addCsrfHeaders();
    authority?.assertCurrent();
    const response = await (authority?.fetch ?? fetch)(
      managedCloudPublishedArtifactDataPath(token),
      {
        method: 'DELETE',
        credentials: 'include',
        headers,
      },
    );
    authority?.assertCurrent();
    if (!response.ok)
      throw await responseError(response, "Failed to clear this site's shared data");
    const raw: unknown = await response.json();
    authority?.assertCurrent();
    return ManagedCloudPublishedArtifactDataClearResponseSchema.parse(raw).cleared;
  });
}

export type SiteViewer = ManagedCloudPublishedArtifactViewer;

async function readViewers(response: Response, fallback: string): Promise<SiteViewer[]> {
  if (!response.ok) throw await responseError(response, fallback);
  const body: unknown = await response.json();
  return ManagedCloudPublishedArtifactViewersResponseSchema.parse(body).viewers;
}

export async function listSiteViewers(
  token: string,
  signal?: AbortSignal,
  authority?: Pick<RequestAuthority, 'assertCurrent' | 'fetch'>,
): Promise<SiteViewer[]> {
  return withPublicationAuthority(authority, async () => {
    const response = await (authority?.fetch ?? fetch)(
      managedCloudPublishedArtifactViewersPath(token),
      {
        credentials: 'include',
        ...(signal ? { signal } : {}),
      },
    );
    authority?.assertCurrent();
    return readViewers(response, 'Failed to load who this site is shared with');
  });
}

export async function changeSiteViewer(
  token: string,
  email: string,
  action: 'add' | 'remove',
  authority?: Pick<RequestAuthority, 'assertCurrent' | 'fetch'>,
): Promise<SiteViewer[]> {
  return withPublicationAuthority(authority, async () => {
    const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
    authority?.assertCurrent();
    const response = await (authority?.fetch ?? fetch)(
      managedCloudPublishedArtifactViewersPath(token),
      {
        method: action === 'add' ? 'POST' : 'DELETE',
        credentials: 'include',
        headers,
        body: JSON.stringify({ email } satisfies ManagedCloudPublishedArtifactViewerRequest),
      },
    );
    authority?.assertCurrent();
    return readViewers(
      response,
      action === 'add' ? 'Failed to share with that person' : 'Failed to remove that person',
    );
  });
}
