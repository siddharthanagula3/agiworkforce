import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  PUBLISHED_TOKEN_REGEX,
  getPublishedArtifactByToken,
} from '@/lib/services/published-artifact-service';
import { PublishedArtifactView } from './PublishedArtifactView';
import { ReportContentLink } from '@/app/copyright/report/ReportContentLink';
import type { PublishedArtifactKind } from '@/features/chat/components/artifacts/publishedArtifactRender';

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
    robots: { index: false, follow: false },
  };
}

export default async function PublishedArtifactPage({ params }: Props) {
  const { token } = await params;

  if (!PUBLISHED_TOKEN_REGEX.test(token)) {
    notFound();
  }

  const artifact = await getPublishedArtifactByToken(getNeonDb(), token).catch(() => null);

  if (!artifact) {
    notFound();
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
