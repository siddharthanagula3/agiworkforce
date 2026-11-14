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
      help={{ docId: 'mcp-connections', label: 'How MCP servers work' }}
      title="MCP servers"
      description="Servers published to every member. Retiring one removes it for everyone."
    >
      <WorkspaceMcpServers />
    </ConsolePage>
  );
}
