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
      redirectTo="/settings/connections"
      signInLabel="Sign in to see your connections"
      secondary={{ href: '/connectors/mcp-directory', label: 'Browse the MCP directory' }}
    >
      Your connections and their permissions are part of your account. The MCP directory is public.
    </SignedOutSurface>
  );
}
