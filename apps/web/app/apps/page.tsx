import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';
import { getRequestIdentity } from '@/lib/server/identity';
import { SignedOutSurface } from '@shared/components/marketing/SignedOutSurface';
import { reportUnreadableIdentity } from '@/lib/server/unreadable-identity';

async function isSignedIn(): Promise<boolean> {
  try {
    return (await getRequestIdentity()).isSignedIn;
  } catch (error) {
    reportUnreadableIdentity(error, '/apps');
    return false;
  }
}

export default async function AppsPage() {
  if (await isSignedIn()) {
    return <SettingsModalRedirect section="plugins" />;
  }

  return (
    <SignedOutSurface
      eyebrow="Apps"
      heading="Apps connect AGI to the tools you already use"
      signInHref="/login?redirectTo=%2Fapps"
      signInLabel="Sign in to browse apps"
      secondary={{ href: '/features/plugins', label: 'How apps and plugins work' }}
    >
      An app bundles the commands, skills and connections for one service, so the assistant can read
      from it and act in it. Which apps you can install depends on your workspace, so the directory
      needs you signed in.
    </SignedOutSurface>
  );
}
