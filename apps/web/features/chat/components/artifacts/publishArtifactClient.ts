import { addCsrfHeaders } from '@/lib/client/csrf';
import type { CloudPublisher, PublishableArtifact } from '@agiworkforce/artifacts';
import type { PublishedArtifactKind } from './publishedArtifactRender';

interface PublishResponse {
  token?: unknown;
  shareUrl?: unknown;
  publishedAt?: unknown;
  visibility?: unknown;
  workspace?: unknown;
}

export interface WebPublishDetails {
  shareUrl: string;
  visibility: 'public' | 'organization';
  /** Null when the publisher belongs to no workspace, so there is nobody to share with. */
  workspace: { memberCount: number } | null;
}

function readWorkspace(value: unknown): WebPublishDetails['workspace'] {
  if (!value || typeof value !== 'object') return null;
  const count = Number((value as { memberCount?: unknown }).memberCount ?? 0);
  return { memberCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0 };
}

export function resolvePublishableKind(
  type: string,
  language?: string | null,
): PublishedArtifactKind | null {
  const lang = (language ?? '').toLowerCase();
  switch (type) {
    case 'html':
    case 'react':
    case 'svg':
    case 'mermaid':
      return type;
    case 'code':
      return 'code';
    case 'document':
      if (lang === 'md' || lang === 'markdown') return 'markdown';
      if (lang === 'txt' || lang === 'text' || lang === '') return 'text';
      return null;
    default:
      return null;
  }
}

export class ArtifactNotPublishableError extends Error {
  constructor(type: string) {
    super(
      `Artifacts of type "${type}" cannot be published to a public page yet. Download or copy it instead.`,
    );
    this.name = 'ArtifactNotPublishableError';
  }
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string } | string;
  };
  if (typeof body.error === 'string') return body.error;
  if (typeof body.error?.message === 'string') return body.error.message;
  return fallback;
}

export interface CreateWebCloudPublisherOptions {
  conversationId?: string | null;
  fetchImpl?: typeof fetch;
  /**
   * Told what the publish actually produced, including whether the publisher
   * has a workspace to share into. The `CloudPublisher` contract is
   * surface-neutral and carries neither, so the web host learns them here
   * rather than widening a shared type for one surface.
   */
  onPublished?: (details: WebPublishDetails) => void;
}

export function createWebCloudPublisher(
  options: CreateWebCloudPublisherOptions = {},
): CloudPublisher {
  const doFetch = options.fetchImpl ?? fetch;

  return async (artifact: PublishableArtifact) => {
    const kind = resolvePublishableKind(artifact.type, artifact.language);
    if (!kind) {
      throw new ArtifactNotPublishableError(artifact.type);
    }

    const response = await doFetch('/api/artifacts/publish', {
      method: 'POST',
      credentials: 'include',
      headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        artifactId: artifact.id,
        title: artifact.title ?? '',
        kind,
        ...(artifact.language ? { language: artifact.language } : {}),
        content: artifact.content,
        ...(options.conversationId ? { conversationId: options.conversationId } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Failed to publish artifact'));
    }

    const body = (await response.json()) as PublishResponse;
    if (typeof body.shareUrl !== 'string' || !body.shareUrl) {
      throw new Error('The publish endpoint returned no share URL.');
    }

    options.onPublished?.({
      shareUrl: body.shareUrl,
      visibility: body.visibility === 'organization' ? 'organization' : 'public',
      workspace: readWorkspace(body.workspace),
    });

    return {
      shareUrl: body.shareUrl,
      ...(typeof body.publishedAt === 'string' ? { publishedAt: body.publishedAt } : {}),
    };
  };
}

export type PublishedArtifactAudience = 'public' | 'organization';

export interface ArtifactAudienceChange {
  shareUrl: string;
  visibility: PublishedArtifactAudience;
}

export function readPublishedTokenFromUrl(shareUrl: string): string | null {
  const match = /\/shared-artifact\/([A-Za-z0-9_-]{24})\/?$/.exec(shareUrl.trim());
  return match?.[1] ?? null;
}

/**
 * Move a published artifact between its two audiences.
 *
 * The token comes out of the share URL the publish already returned, so the
 * panel never has to hold a second identifier for the same page.
 */
export async function setPublishedArtifactAudience(
  shareUrl: string,
  visibility: PublishedArtifactAudience,
  fetchImpl: typeof fetch = fetch,
): Promise<ArtifactAudienceChange> {
  const token = readPublishedTokenFromUrl(shareUrl);
  if (!token) {
    throw new Error('That share link does not name a published artifact.');
  }

  const response = await fetchImpl(`/api/artifacts/publish/${token}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ visibility }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to change who can open this'));
  }

  const body = (await response.json()) as { shareUrl?: unknown; visibility?: unknown };
  return {
    shareUrl: typeof body.shareUrl === 'string' ? body.shareUrl : shareUrl,
    visibility: body.visibility === 'organization' ? 'organization' : 'public',
  };
}
