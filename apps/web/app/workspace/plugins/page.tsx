import type { Metadata } from 'next';
import { ConsolePage } from '@/features/workspace-console/components/ConsolePage';
import { WorkspacePlugins } from '@/features/workspace-console/components/WorkspacePlugins';

export const metadata: Metadata = {
  title: 'Workspace plugins',
  description: 'Plugins this workspace publishes to its members, and who gets each one.',
};

export default function WorkspacePluginsPage() {
  return (
    <ConsolePage
      title="Plugins"
      description="Plugins this workspace publishes to its members. Choose for each one whether it is required, installed for everyone, available to install or hidden, and give a group its own setting."
    >
      <WorkspacePlugins />
    </ConsolePage>
  );
}
