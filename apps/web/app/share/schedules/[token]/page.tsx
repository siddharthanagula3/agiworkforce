import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MANAGED_CLOUD_SCHEDULE_SHARE_TOKEN_PATTERN } from '@agiworkforce/cloud-contracts';
import { getNeonDb } from '@/lib/server/neon-db';
import { getSharedSchedule } from '@/lib/services/schedule-share-service';
import { SharedSchedulePreview } from '@/features/schedules/components/SharedSchedulePreview';

interface Props {
  params: Promise<{ token: string }>;
}

export const runtime = 'nodejs';

async function readShare(token: string) {
  if (!MANAGED_CLOUD_SCHEDULE_SHARE_TOKEN_PATTERN.test(token)) return null;
  return getSharedSchedule(getNeonDb(), token).catch(() => null);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const share = await readShare((await params).token);
  return {
    title: share ? `${share.snapshot.name} - Shared schedule - AGI` : 'Shared schedule - AGI',
    robots: { index: false, follow: false },
  };
}

export default async function SharedSchedulePage({ params }: Props) {
  const { token } = await params;
  const share = await readShare(token);
  if (!share) notFound();
  return <SharedSchedulePreview token={token} snapshot={share.snapshot} />;
}
