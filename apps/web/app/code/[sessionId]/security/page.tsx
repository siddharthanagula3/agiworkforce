import type { Metadata } from 'next';
import { SecurityScanPage } from '@/features/security-scan';

export const metadata: Metadata = {
  title: { absolute: 'Security scan · AGI Code' },
  description:
    'Scan a repository for exploitable vulnerabilities and review a proposed fix for each.',
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default async function CodeSessionSecurityRoute({ params }: Props) {
  const { sessionId } = await params;
  return <SecurityScanPage sessionId={sessionId} />;
}
