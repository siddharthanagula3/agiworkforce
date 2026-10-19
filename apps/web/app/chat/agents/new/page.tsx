import type { Metadata } from 'next';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { AgentEditorPage } from '@/features/agents';

export const metadata: Metadata = {
  title: 'New agent',
  robots: { index: false, follow: false },
};

export default function NewAgentRoute() {
  return (
    <WebAppShell>
      <AgentEditorPage agentId={null} />
    </WebAppShell>
  );
}
