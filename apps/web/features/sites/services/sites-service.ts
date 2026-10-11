import { z } from 'zod';
import {
  MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH,
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_VISIBILITIES,
  ManagedCloudPublishedArtifactDataClearResponseSchema,
  ManagedCloudPublishedArtifactDataResponseSchema,
  ManagedCloudPublishedArtifactListResponseSchema,
  ManagedCloudPublishedArtifactSchema,
  ManagedCloudPublishedArtifactUpdateResponseSchema,
  ManagedCloudPublishedArtifactVersionDetailSchema,
  ManagedCloudPublishedArtifactVersionListResponseSchema,
  managedCloudPublishedArtifactDataPath,
  managedCloudPublishedArtifactPath,
  managedCloudPublishedArtifactVersionPath,
  managedCloudPublishedArtifactVersionsPath,
  type ManagedCloudPublishedArtifactDataResponse,
  type ManagedCloudPublishedArtifactUpdateRequest,
  type ManagedCloudPublishedArtifactUpdateResponse,
  type ManagedCloudPublishedArtifactVersion,
  type ManagedCloudPublishedArtifactVersionDetail,
  type ManagedCloudPublishedArtifactVisibility,
} from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';

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

export async function listPublishedSites(signal?: AbortSignal): Promise<PublishedSiteList> {
  const response = await fetch(MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH, {
    credentials: 'include',
    signal,
  });
  if (!response.ok) {
    throw await responseError(response, 'Failed to load published artifacts');
  }
  const body = PublishedSiteListResponseSchema.parse(await response.json());
  return { sites: body.artifacts, workspace: body.workspace };
}

export async function listPublishedArtifactVersions(
  token: string,
  signal?: AbortSignal,
): Promise<ManagedCloudPublishedArtifactVersion[]> {
  const response = await fetch(managedCloudPublishedArtifactVersionsPath(token), {
    credentials: 'include',
    signal,
  });
  if (!response.ok) {
    throw await responseError(response, 'Failed to load the publish history');
  }
  return ManagedCloudPublishedArtifactVersionListResponseSchema.parse(await response.json())
    .versions;
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
): Promise<void> {
  const detail = await readPublishedSiteVersion(artifact.token, version);
  const response = await fetch(MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH, {
    method: 'POST',
    credentials: 'include',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      artifactId: artifact.artifactId,
      title: detail.title,
      kind: detail.kind,
      ...(detail.language ? { language: detail.language } : {}),
      content: detail.content,
    }),
  });
  if (!response.ok) {
    throw await responseError(response, 'Failed to put that version live');
  }
}

export async function unpublishArtifact(token: string): Promise<void> {
  const response = await fetch(managedCloudPublishedArtifactPath(token), {
    method: 'DELETE',
    credentials: 'include',
    headers: await addCsrfHeaders(),
  });
  if (!response.ok) {
    throw await responseError(response, 'Failed to unpublish artifact');
  }
}

export async function updatePublishedSite(
  token: string,
  change: ManagedCloudPublishedArtifactUpdateRequest,
): Promise<ManagedCloudPublishedArtifactUpdateResponse> {
  const response = await fetch(managedCloudPublishedArtifactPath(token), {
    method: 'PATCH',
    credentials: 'include',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(change),
  });
  if (!response.ok) {
    throw await responseError(
      response,
      change.title !== undefined
        ? 'Failed to rename this site'
        : 'Failed to change who can open this',
    );
  }
  return ManagedCloudPublishedArtifactUpdateResponseSchema.parse(await response.json());
}

export async function readPublishedSiteData(
  token: string,
  signal?: AbortSignal,
): Promise<SiteData> {
  const response = await fetch(managedCloudPublishedArtifactDataPath(token), {
    credentials: 'include',
    signal,
  });
  if (!response.ok) {
    throw await responseError(response, "Failed to load this site's data");
  }
  return ManagedCloudPublishedArtifactDataResponseSchema.parse(await response.json());
}

export async function clearPublishedSiteSharedData(token: string): Promise<number> {
  const response = await fetch(managedCloudPublishedArtifactDataPath(token), {
    method: 'DELETE',
    credentials: 'include',
    headers: await addCsrfHeaders(),
  });
  if (!response.ok) {
    throw await responseError(response, "Failed to clear this site's shared data");
  }
  return ManagedCloudPublishedArtifactDataClearResponseSchema.parse(await response.json()).cleared;
}
