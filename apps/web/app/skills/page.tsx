'use client';

/**
 * /skills — opens the settings modal at the Skills section for authenticated
 * users. Unauthenticated visitors see a redirect to login (skills require an account).
 */

import { Suspense } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';

function SkillsRoute() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/login?redirectTo=%2Fskills');
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) return null;

  return <SettingsModalRedirect section="skills" />;
}

export default function SkillsPage() {
  return (
    <Suspense>
      <SkillsRoute />
    </Suspense>
  );
}
