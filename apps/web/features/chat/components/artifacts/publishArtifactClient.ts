/**
 * Web `CloudPublisher` adapter (CAP-015 slice 3).
 *
 * `@agiworkforce/artifacts` has exposed a `CloudPublisher` injection point
 * since AUDIT-FIX ART-27, and its module docs stated the gap plainly: "No
 * surface ships a CloudPublisher yet, so byok/managed publish currently
 * resolves to { kind: 'unavailable' } everywhere." This file is the first one,
 * and it is deliberately the ONLY place in the web app that knows the publish
 * endpoint — the platform package still performs no network I/O of its own.
 *
 * Not everything can be published: the public page can only serve the kinds it
 * has a safe renderer for (see `publishedArtifactRender.ts`). Rather than
 * POSTing a document/image artifact and letting the server 400, the mapping
 * below returns `null` and the caller keeps the honest clipboard/download path.
 */

import { addCsrfHeaders } from '@/lib/client/csrf';
import type { CloudPublisher, PublishableArtifact } from '@agiworkforce/artifacts';
import type { PublishedArtifactKind } from './publishedArtifactRender';

/** Server response shape for POST /api/artifacts/publish. */
interface PublishResponse {
  token?: unknown;
  shareUrl?: unknown;
  publishedAt?: unknown;
}

/**
 * Map an in-app artifact type + language onto a publishable kind, or `null`
 * when this artifact has no safe public renderer.
 *
 * `document` is split by language: markdown documents publish as `markdown`,
 * while pdf/docx documents are opaque bytes with no public viewer. Tabular,
 * presentation, email and image artifacts render through in-app components
 * that the public page does not host, so they are not publishable either.
 */
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
      // pdf / docx / doc — real bytes with no public viewer.
      return null;
    default:
      return null;
  }
}

/** Thrown when the artifact simply has no public renderer. */
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
  /** Conversation the artifact belongs to, so a deleted chat cleans up its pages. */
  conversationId?: string | null;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Build the `CloudPublisher` that `publishArtifact()` calls on the byok /
 * managed paths. Errors propagate: the platform contract says a publisher that
 * cannot publish must throw rather than resolve without a URL, so the panel can
 * show the real reason instead of a fabricated success.
 */
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
      // Resolving without a URL would make publishArtifact() throw a confusing
      // internal error; say what actually went wrong instead.
      throw new Error('The publish endpoint returned no share URL.');
    }

    return {
      shareUrl: body.shareUrl,
      ...(typeof body.publishedAt === 'string' ? { publishedAt: body.publishedAt } : {}),
    };
  };
}
