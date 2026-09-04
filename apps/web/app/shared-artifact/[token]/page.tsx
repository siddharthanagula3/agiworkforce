import type { Metadata } from 'next';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  PUBLISHED_TOKEN_REGEX,
  getPublishedArtifactByToken,
} from '@/lib/services/published-artifact-service';
import { PublishedArtifactView } from './PublishedArtifactView';
import { UnavailableArtifact } from './UnavailableArtifact';
import { ReportContentLink } from '@/app/copyright/report/ReportContentLink';
import type { PublishedArtifactKind } from '@/features/chat/components/artifacts/publishedArtifactRender';

interface Props {
  params: Promise<{ token: string }>;
}

export const runtime = 'nodejs';

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

  const artifact = await getPublishedArtifactByToken(getNeonDb(), token).catch(() => null);

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
      />
      <ReportContentLink publicPath={`/shared-artifact/${token}`} />
    </>
  );
}
