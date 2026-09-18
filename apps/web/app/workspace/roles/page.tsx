import type { Metadata } from 'next';
import { ConsolePage } from '@/features/workspace-console/components/ConsolePage';
import { WorkspaceDelegation } from '@/features/workspace-console/components/WorkspaceDelegation';
import { WorkspaceRoles } from '@/features/workspace-console/components/WorkspaceRoles';

export const metadata: Metadata = {
  title: 'Roles',
  description: 'Built-in and custom roles, additional roles, and directory group roles.',
};

export default function WorkspaceRolesPage() {
  return (
    <ConsolePage
      title="Roles"
      description="What each role may do, who holds which roles, and which roles a directory group grants."
    >
      <WorkspaceRoles />
      <WorkspaceDelegation />
    </ConsolePage>
  );
}
