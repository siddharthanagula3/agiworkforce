import type { Metadata } from 'next';
import { ConsolePage } from '@/features/workspace-console/components/ConsolePage';
import { WorkspaceConnectorPolicy } from '@/features/workspace-console/components/WorkspaceConnectorPolicy';

export const metadata: Metadata = {
  title: 'Connector policy',
  description: 'Which integrations this workspace permits.',
};

export default function WorkspaceConnectorsPage() {
  return (
    <ConsolePage
      title="Connectors"
      description="Which integrations members may use. Applied where the tool catalog is assembled, so a blocked connector is never offered to the model — from chat, a scheduled task, or an agent run."
    >
      <WorkspaceConnectorPolicy />
    </ConsolePage>
  );
}
