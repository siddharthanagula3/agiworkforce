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
      description="Choose whether each plugin is required, installed, available or hidden."
    >
      <WorkspacePlugins />
    </ConsolePage>
  );
}
