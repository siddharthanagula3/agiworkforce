import type { Metadata } from 'next';
import { ConsolePage } from '@/features/workspace-console/components/ConsolePage';
import { WorkspaceUsageAnalytics } from '@/features/workspace-console/components/WorkspaceUsageAnalytics';

export const metadata: Metadata = {
  title: 'Usage',
  description: 'Managed cloud spend by member, model, and provider.',
};

export default function WorkspaceUsagePage() {
  return (
    <ConsolePage
      title="Usage"
      description="What this workspace consumed on AGI-managed cloud, by member, model, and provider."
    >
      <WorkspaceUsageAnalytics />
    </ConsolePage>
  );
}
