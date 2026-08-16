
import { addCsrfHeaders } from '@/lib/client/csrf';
import type { CloudPublisher, PublishableArtifact } from '@agiworkforce/artifacts';
import type { PublishedArtifactKind } from './publishedArtifactRender';

interface PublishResponse {
  token?: unknown;
  shareUrl?: unknown;
  publishedAt?: unknown;
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

    return {
      shareUrl: body.shareUrl,
      ...(typeof body.publishedAt === 'string' ? { publishedAt: body.publishedAt } : {}),
    };
  };
}
