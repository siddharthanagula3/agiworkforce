import type { Metadata } from 'next';
import { ConsolePage } from '@/features/workspace-console/components/ConsolePage';
import { WorkspaceConnectorPolicy } from '@/features/workspace-console/components/WorkspaceConnectorPolicy';

export const metadata: Metadata = {
  title: 'Connector policy',
  description: 'Which integrations and websites this workspace permits.',
};

export default function WorkspaceConnectorsPage() {
  return (
    <ConsolePage
      help={{ docId: 'connectors-and-mcp', label: 'How connectors work' }}
      title="Connectors"
      description="Which integrations members may use and which websites web search reads. Applied on the server, so a blocked connector is never offered to the model and a blocked site is never read, from chat, a scheduled task, or an agent run."
    >
      <WorkspaceConnectorPolicy />
    </ConsolePage>
  );
}
