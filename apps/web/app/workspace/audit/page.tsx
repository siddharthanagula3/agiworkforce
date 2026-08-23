import type { Metadata } from 'next';
import { ConsolePage } from '@/features/workspace-console/components/ConsolePage';
import { WorkspaceAuditSection } from '@/features/settings/sections/WorkspaceAuditSection';

export const metadata: Metadata = {
  title: 'Audit trail',
  description: 'Administrative and policy events for this workspace, with export.',
};

export default function WorkspaceAuditPage() {
  return (
    <ConsolePage
      title="Audit"
      description="Administrative, policy, and access events for this workspace. Writes go through a security-definer function, so this record cannot be edited from the application."
    >
      <WorkspaceAuditSection />
    </ConsolePage>
  );
}
