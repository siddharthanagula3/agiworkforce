import type { Metadata } from 'next';
import { TeamInvitationAcceptance } from '@/features/teams/components/TeamInvitationAcceptance';

export const metadata: Metadata = {
  title: 'Team invitation | AGI',
  description: 'Accept or decline an invitation to an AGI Team workspace.',
};

export default function TeamInvitationPage() {
  return <TeamInvitationAcceptance />;
}
