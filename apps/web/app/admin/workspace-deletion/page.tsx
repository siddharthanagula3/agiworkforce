import type { Metadata } from 'next';
import WorkspaceDeletionPage from '@/features/admin/pages/WorkspaceDeletionPage';

export const metadata: Metadata = {
  title: 'Delete this workspace',
  description: 'Schedule a workspace for deletion, and cancel it while the grace period runs.',
};

export default function AdminWorkspaceDeletionPage() {
  return <WorkspaceDeletionPage />;
}
