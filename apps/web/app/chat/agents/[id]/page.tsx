import type { Metadata } from 'next';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { AgentEditorPage } from '@/features/agents';

export const metadata: Metadata = {
  title: 'Agent',
  robots: { index: false, follow: false },
};

export default async function AgentRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <WebAppShell>
      <AgentEditorPage agentId={id} />
    </WebAppShell>
  );
}
