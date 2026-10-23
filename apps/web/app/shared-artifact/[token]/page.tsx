import type { Metadata } from 'next';
import { getNeonDb } from '@/lib/server/neon-db';
import { getCurrentUserRlsDb } from '@/lib/server/rls-db';
import { artifactAiEnabled } from '@/lib/server/artifact-ai-switch';
import {
  PUBLISHED_TOKEN_REGEX,
  getPublishedArtifactByToken,
  isInviteOnlyPublication,
  type PublishedArtifact,
} from '@/lib/services/published-artifact-service';
import { getInvitedReadableArtifactByToken } from '@/lib/services/published-site-viewer-service';
import { InviteOnlyArtifact } from './InviteOnlyArtifact';
import { getOrgReadableArtifactByToken } from '@/lib/services/org-shared-artifact-service';
import { PublishedArtifactView } from './PublishedArtifactView';
import { UnavailableArtifact } from './UnavailableArtifact';
import { ReportContentLink } from '@/app/copyright/report/ReportContentLink';
import type { PublishedArtifactKind } from '@/features/chat/components/artifacts/publishedArtifactRender';

interface Props {
  params: Promise<{ token: string }>;
}

export const runtime = 'nodejs';

/** Public rows first; workspace and invited rows are left to the RLS-scoped read. */
async function readArtifactForViewer(
  token: string,
): Promise<{ artifact: PublishedArtifact | null; signedIn: boolean }> {
  const publiclyVisible = await getPublishedArtifactByToken(getNeonDb(), token).catch(() => null);
  if (publiclyVisible) return { artifact: publiclyVisible, signedIn: false };

  const scoped = await getCurrentUserRlsDb().catch(() => null);
  if (!scoped) return { artifact: null, signedIn: false };
  const shared =
    (await getOrgReadableArtifactByToken(scoped.db, token).catch(() => null)) ??
    (await getInvitedReadableArtifactByToken(scoped.db, token).catch(() => null));
  return { artifact: shared, signedIn: true };
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

  const { artifact, signedIn } = await readArtifactForViewer(token);

  if (!artifact) {
    const inviteOnly = await isInviteOnlyPublication(getNeonDb(), token).catch(() => false);
    return inviteOnly ? (
      <InviteOnlyArtifact token={token} signedIn={signedIn} />
    ) : (
      <UnavailableArtifact />
    );
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
        token={token}
        aiEnabled={artifactAiEnabled()}
      />
      <ReportContentLink publicPath={`/shared-artifact/${token}`} />
    </>
  );
}
