import type { Metadata } from 'next';
import { ConsolePage } from '@/features/workspace-console/components/ConsolePage';
import { WorkspaceAuditSection } from '@/features/settings/sections/WorkspaceAuditSection';
import { WorkspaceAuditStreaming } from '@/features/workspace-console/components/WorkspaceAuditStreaming';
import { WorkspaceApiKeys } from '@/features/workspace-console/components/WorkspaceApiKeys';

export const metadata: Metadata = {
  title: 'Audit trail',
  description:
    'Administrative and policy events for this workspace, with export and SIEM streaming.',
};

export default function WorkspaceAuditPage() {
  return (
    <ConsolePage
      title="Audit"
      description="Administrative, policy, and access events for this workspace. Writes go through a security-definer function, so this record cannot be edited from the application."
    >
      <div className="flex flex-col gap-6">
        <WorkspaceAuditSection />
        <WorkspaceAuditStreaming />
        <WorkspaceApiKeys />
      </div>
    </ConsolePage>
  );
}
