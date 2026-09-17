import type { Metadata } from 'next';
import { ConsolePage } from '@/features/workspace-console/components/ConsolePage';
import { WorkspaceDataControls } from '@/features/workspace-console/components/WorkspaceDataControls';
import { WorkspaceDomainRetention } from '@/features/workspace-console/components/WorkspaceDomainRetention';

export const metadata: Metadata = {
  title: 'Data controls',
  description: 'Legal holds and the record of what retention has deleted.',
};

export default function WorkspaceDataPage() {
  return (
    <ConsolePage
      title="Data"
      description="Legal holds suspend retention for their subject. The sweep record below is what you show an auditor instead of asserting that deletion happens."
    >
      <div className="flex flex-col gap-6">
        <WorkspaceDataControls />
        <WorkspaceDomainRetention />
      </div>
    </ConsolePage>
  );
}
