'use client';

import { useSession } from '@/lib/identity/client';
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';
import { SignedOutSurface } from '@shared/components/marketing/SignedOutSurface';

export default function AppsPage() {
  const { isSignedIn, isLoaded } = useSession();

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <SignedOutSurface
        eyebrow="Apps"
        heading="Apps connect AGI to the tools you already use"
        signInHref="/login?redirectTo=%2Fapps"
        signInLabel="Sign in to browse apps"
        secondary={{ href: '/features/plugins', label: 'How apps and plugins work' }}
      >
        An app bundles the commands, skills and connections for one service, so the assistant can
        read from it and act in it. Which apps you can install depends on your workspace, so the
        directory needs you signed in.
      </SignedOutSurface>
    );
  }

  return <SettingsModalRedirect section="plugins" />;
}
