import type { Metadata } from 'next';
import { ConsolePage } from '@/features/workspace-console/components/ConsolePage';
import { OrganizationSharingSection } from '@/features/settings/sections/OrganizationSharingSection';

export const metadata: Metadata = {
  title: 'Sharing',
  description: 'Projects, conversations, artifacts and connectors shared across this workspace.',
};

export default function WorkspaceSharingPage() {
  return (
    <ConsolePage
      help={{ docId: 'sharing-conversations', label: 'How sharing works' }}
      title="Sharing"
      description="Projects, conversations, artifacts and connectors this workspace shares, and the access level each grant carries."
    >
      <OrganizationSharingSection />
    </ConsolePage>
  );
}
