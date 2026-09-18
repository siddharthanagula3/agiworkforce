import type { Metadata } from 'next';
import { ConsolePage } from '@/features/workspace-console/components/ConsolePage';
import { WorkspaceMcpServers } from '@/features/workspace-console/components/WorkspaceMcpServers';

export const metadata: Metadata = {
  title: 'Workspace MCP servers',
  description: 'MCP servers this workspace publishes to its members.',
};

export default function WorkspaceMcpPage() {
  return (
    <ConsolePage
      title="MCP servers"
      description="Servers this workspace publishes to every member, so nobody has to configure the same connection twice. Retiring one takes it away from everyone."
    >
      <WorkspaceMcpServers />
    </ConsolePage>
  );
}
