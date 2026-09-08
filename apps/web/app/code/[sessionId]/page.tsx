import type { Metadata } from 'next';
import { CloudCodePage } from '@/features/code';

export const metadata: Metadata = {
  title: { absolute: 'AGI Code' },
  description: 'Describe a task and AGI Code runs it in an isolated managed environment.',
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default async function CodeSessionRoute({ params }: Props) {
  const { sessionId } = await params;
  return <CloudCodePage sessionId={sessionId} />;
}
