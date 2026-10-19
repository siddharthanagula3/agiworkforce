import type { Metadata } from 'next';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { AgentsPage } from '@/features/agents';

export const metadata: Metadata = {
  title: 'Agents',
  description: 'Build, share and run agents with their own instructions, tools and files.',
  robots: { index: false, follow: false },
};

export default function AgentsRoute() {
  return (
    <WebAppShell>
      <AgentsPage />
    </WebAppShell>
  );
}
