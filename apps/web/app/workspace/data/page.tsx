import type { Metadata } from 'next';
import { ConsolePage } from '@/features/workspace-console/components/ConsolePage';
import { WorkspaceDataControls } from '@/features/workspace-console/components/WorkspaceDataControls';

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
      <WorkspaceDataControls />
    </ConsolePage>
  );
}
