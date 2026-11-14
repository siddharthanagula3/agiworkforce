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
      description="Integrations members may use and sites web search may read, enforced on the server."
    >
      <WorkspaceConnectorPolicy />
    </ConsolePage>
  );
}
