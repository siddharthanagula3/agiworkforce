'use client';

import { useSession } from '@/lib/identity/client';
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';
import { SignedOutSkills, type PublicSkill } from './SignedOutSkills';

export function SkillsRoute({ skills }: { skills: readonly PublicSkill[] | null }) {
  const { isSignedIn, isLoaded } = useSession();

  if (!isLoaded) return null;
  if (!isSignedIn) return <SignedOutSkills skills={skills} />;

  return <SettingsModalRedirect section="skills" />;
}
