import type { Metadata } from 'next';
import { ConsolePage } from '@/features/workspace-console/components/ConsolePage';
import { WorkspacePolicySection } from '@/features/settings/sections/WorkspacePolicySection';
import { WorkspaceFeatureControls } from '@/features/workspace-console/components/WorkspaceFeatureControls';

export const metadata: Metadata = {
  title: 'Workspace policy',
  description: 'Privacy modes, managed compute, sync surfaces, retention, features and exceptions.',
};

export default function WorkspacePolicyPage() {
  return (
    <ConsolePage
      title="Policy"
      description="What members of this workspace may run, where their chats may sync, and how long records are kept."
    >
      <div className="flex flex-col gap-6">
        <WorkspacePolicySection />
        <WorkspaceFeatureControls />
      </div>
    </ConsolePage>
  );
}
