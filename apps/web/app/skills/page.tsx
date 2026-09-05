'use client';

import { Suspense } from 'react';
import { useSession } from '@/lib/identity/client';
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';
import { SignedOutSkills } from './SignedOutSkills';

function SkillsRoute() {
  const { isSignedIn, isLoaded } = useSession();

  if (!isLoaded) return null;
  if (!isSignedIn) return <SignedOutSkills />;

  return <SettingsModalRedirect section="skills" />;
}

export default function SkillsPage() {
  return (
    <Suspense>
      <SkillsRoute />
    </Suspense>
  );
}
