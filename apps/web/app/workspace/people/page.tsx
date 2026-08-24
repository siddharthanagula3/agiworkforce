import type { Metadata } from 'next';
import { ConsolePage } from '@/features/workspace-console/components/ConsolePage';
import { TeamSection } from '@/features/settings/sections/TeamSection';

export const metadata: Metadata = {
  title: 'Members',
  description: 'Manage workspace members, roles, invitations, and seats.',
};

export default function WorkspacePeoplePage() {
  return (
    <ConsolePage
      title="Members"
      description="Who belongs to this workspace, what role they hold, and how many seats that consumes."
    >
      <TeamSection />
    </ConsolePage>
  );
}
