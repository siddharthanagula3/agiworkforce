'use client';

import { useSession } from '@/lib/identity/client';
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';
import { SignedOutSurface } from '@shared/components/marketing/SignedOutSurface';

export default function ConnectionsSettingsPage() {
  const { isSignedIn, isLoaded } = useSession();

  if (!isLoaded) return null;

  if (isSignedIn) {
    return <SettingsModalRedirect section="connectors" />;
  }

  return (
    <SignedOutSurface
      eyebrow="Connectors"
      heading="Your connections live in settings"
      signInHref="/login?redirectTo=%2Fsettings%2Fconnections"
      signInLabel="Sign in to see your connections"
      secondary={{ href: '/connectors/mcp-directory', label: 'Browse the MCP directory' }}
    >
      Which services you have connected, the tools each one may run and the permission you gave them
      are all part of your account, so this page needs you signed in. The directory of remote MCP
      servers you can connect is public.
    </SignedOutSurface>
  );
}
