import type { Metadata } from 'next';
import { ConsolePage } from '@/features/workspace-console/components/ConsolePage';
import { WorkspacePolicySection } from '@/features/settings/sections/WorkspacePolicySection';

export const metadata: Metadata = {
  title: 'Workspace policy',
  description: 'Privacy modes, managed compute, sync surfaces, and retention.',
};

export default function WorkspacePolicyPage() {
  return (
    <ConsolePage
      title="Policy"
      description="What members of this workspace may run, where their chats may sync, and how long records are kept."
    >
      <WorkspacePolicySection />
    </ConsolePage>
  );
}
