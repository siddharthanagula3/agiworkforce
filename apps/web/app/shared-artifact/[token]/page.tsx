import type { Metadata } from 'next';
import { getNeonDb } from '@/lib/server/neon-db';
import { getCurrentUserRlsDb } from '@/lib/server/rls-db';
import {
  PUBLISHED_TOKEN_REGEX,
  getPublishedArtifactByToken,
  type PublishedArtifact,
} from '@/lib/services/published-artifact-service';
import { getOrgReadableArtifactByToken } from '@/lib/services/org-shared-artifact-service';
import { PublishedArtifactView } from './PublishedArtifactView';
import { UnavailableArtifact } from './UnavailableArtifact';
import { ReportContentLink } from '@/app/copyright/report/ReportContentLink';
import type { PublishedArtifactKind } from '@/features/chat/components/artifacts/publishedArtifactRender';

interface Props {
  params: Promise<{ token: string }>;
}

export const runtime = 'nodejs';

/**
 * Two audiences, in the order that leaks the least.
 *
 * The anonymous lookup answers only for rows still marked `public`, so a
 * workspace-only artifact never reaches this page through the token alone. It
 * then falls through to the signed-in read, where 0184's RLS policy, not this
 * function, decides whether the viewer's organization holds a grant. A signed
 * out visitor gets `null` from that second call and the same honest
 * "unavailable" as a revoked link.
 */
async function readArtifactForViewer(token: string): Promise<PublishedArtifact | null> {
  const publiclyVisible = await getPublishedArtifactByToken(getNeonDb(), token).catch(() => null);
  if (publiclyVisible) return publiclyVisible;

  const scoped = await getCurrentUserRlsDb().catch(() => null);
  if (!scoped) return null;
  return getOrgReadableArtifactByToken(scoped.db, token).catch(() => null);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  if (!PUBLISHED_TOKEN_REGEX.test(token)) {
    return { title: 'Published artifact - AGI', robots: { index: false, follow: false } };
  }

  const artifact = await getPublishedArtifactByToken(getNeonDb(), token).catch(() => null);

  return {
    title: artifact?.title ? `${artifact.title} - AGI` : 'Published artifact - AGI',
    robots: { index: false, follow: false },
  };
}

export default async function PublishedArtifactPage({ params }: Props) {
  const { token } = await params;

  // notFound() would render the global 404, "the page you're looking for
  // doesn't exist or has been moved", which misdescribes both cases below and
  // blames the recipient for a link somebody else sent them. A malformed token
  // and a revoked one are indistinguishable to the person holding the link, so
  // they get the same honest answer.
  if (!PUBLISHED_TOKEN_REGEX.test(token)) {
    return <UnavailableArtifact />;
  }

  const artifact = await readArtifactForViewer(token);

  if (!artifact) {
    return <UnavailableArtifact />;
  }

  return (
    <>
      <PublishedArtifactView
        title={artifact.title}
        kind={artifact.kind as PublishedArtifactKind}
        language={artifact.language}
        content={artifact.content}
        publishedAt={artifact.updatedAt}
        audience={artifact.visibility}
      />
      <ReportContentLink publicPath={`/shared-artifact/${token}`} />
    </>
  );
}
