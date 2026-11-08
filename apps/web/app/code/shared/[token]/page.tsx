import type { Metadata } from 'next';
import { SharedCodeSessionPage } from '@/features/code';

export const metadata: Metadata = {
  title: { absolute: 'Shared Code session' },
  description: 'A coding session shared with you from Code.',
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ token: string }>;
}

export default async function SharedCodeSessionRoute({ params }: Props) {
  const { token } = await params;
  return <SharedCodeSessionPage token={token} />;
}
