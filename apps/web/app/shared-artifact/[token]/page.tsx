import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  PUBLISHED_TOKEN_REGEX,
  getPublishedArtifactByToken,
} from '@/lib/services/published-artifact-service';
import { PublishedArtifactView } from './PublishedArtifactView';
import type { PublishedArtifactKind } from '@/features/chat/components/artifacts/publishedArtifactRender';

/**
 * Public page for a published artifact (CAP-015 slice 2).
 *
 * Mirrors `app/share/[token]/page.tsx`: no authentication, the 144-bit token is
 * the read grant, and the row is fetched with the app-owner adapter because
 * there is no signed-in subject to scope RLS to.
 *
 * Two deliberate differences from the conversation-share page:
 *
 *  1. There is no expiry branch. Migration 0095 ships no TTL (founder-pending),
 *     so a published artifact is live until its owner unpublishes it. A page
 *     that rendered an "expired" state would be describing a policy that does
 *     not exist.
 *
 *  2. The artifact body is handed to a CLIENT component that decides how to
 *     render it. Published html/react/mermaid execute author-supplied script,
 *     so they are served only through the sandbox pipeline
 *     (`NEXT_PUBLIC_SANDBOX_ORIGIN` renderer, or the null-origin `srcDoc`
 *     fallback — both `connect-src 'none'`). They are never interpolated into
 *     this document; server-rendering them here would execute published script
 *     on the app origin with the viewer's session attached.
 */

interface Props {
  params: Promise<{ token: string }>;
}

export const runtime = 'nodejs';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  if (!PUBLISHED_TOKEN_REGEX.test(token)) return { title: 'Published artifact - AGI' };

  const artifact = await getPublishedArtifactByToken(getNeonDb(), token).catch(() => null);

  return {
    title: artifact?.title ? `${artifact.title} - AGI` : 'Published artifact - AGI',
    // Unlisted-by-token: keep published pages out of search indexes so a link
    // the owner shared with three people does not become a search result.
    robots: { index: false, follow: false },
  };
}

export default async function PublishedArtifactPage({ params }: Props) {
  const { token } = await params;

  if (!PUBLISHED_TOKEN_REGEX.test(token)) {
    notFound();
  }

  const artifact = await getPublishedArtifactByToken(getNeonDb(), token).catch(() => null);

  // An unpublished token and a token that never existed are the same 404, so
  // this page cannot be used to probe which handles were ever live.
  if (!artifact) {
    notFound();
  }

  return (
    <PublishedArtifactView
      title={artifact.title}
      kind={artifact.kind as PublishedArtifactKind}
      language={artifact.language}
      content={artifact.content}
      publishedAt={artifact.updatedAt}
    />
  );
}
