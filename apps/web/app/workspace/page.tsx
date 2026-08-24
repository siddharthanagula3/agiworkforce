import type { Metadata } from 'next';
import { WorkspacePostureOverview } from '@/features/workspace-console/components/WorkspacePostureOverview';

export const metadata: Metadata = {
  title: 'Workspace overview',
  description: 'Security posture and administration for your workspace.',
};

export default function WorkspaceOverviewPage() {
  return <WorkspacePostureOverview />;
}
