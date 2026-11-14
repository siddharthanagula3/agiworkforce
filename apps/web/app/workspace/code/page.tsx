import type { Metadata } from 'next';
import { ConsolePage } from '@/features/workspace-console/components/ConsolePage';
import { WorkspaceCodeControls } from '@/features/workspace-console/components/WorkspaceCodeControls';

export const metadata: Metadata = {
  title: 'Workspace code controls',
  description: 'GitHub connections, MCP servers, desktop cloud sync, automated review and egress.',
};

export default function WorkspaceCodePage() {
  return (
    <ConsolePage
      title="Code"
      description="What coding sessions may connect to and reach, and how long transcripts are kept."
    >
      <WorkspaceCodeControls />
    </ConsolePage>
  );
}
