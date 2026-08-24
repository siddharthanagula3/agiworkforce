import type { Metadata } from 'next';
import { ConsolePage } from '@/features/workspace-console/components/ConsolePage';
import { WorkspaceIdentityPanels } from '@/features/workspace-console/components/WorkspaceIdentityPanels';

export const metadata: Metadata = {
  title: 'Identity',
  description: 'Single sign-on, domain verification, and SCIM directory provisioning.',
};

export default function WorkspaceIdentityPage() {
  return (
    <ConsolePage
      title="Identity"
      description="How people authenticate into this workspace, and how your directory keeps membership current."
    >
      <WorkspaceIdentityPanels />
    </ConsolePage>
  );
}
