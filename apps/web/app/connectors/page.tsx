import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ConnectorsPage } from '@/features/connectors/pages/ConnectorsPage';

export const metadata: Metadata = {
  title: 'Connectors | AGI Workforce',
  description:
    'Connect Gmail, Slack, GitHub, Notion, and 100+ more tools. Give your AI agents access to the apps you use every day.',
  alternates: { canonical: '/connectors' },
};

export default function ConnectorsRoute() {
  return (
    <Suspense>
      <ConnectorsPage />
    </Suspense>
  );
}
