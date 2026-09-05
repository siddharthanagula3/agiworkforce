'use client';

import { useSession } from '@/lib/identity/client';
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';
import { SignedOutSurface } from '@shared/components/marketing/SignedOutSurface';

function ConnectorsRoute() {
  const { isSignedIn, isLoaded } = useSession();

  if (!isLoaded) return null;

  if (isSignedIn) {
    return <SettingsModalRedirect section="connectors" />;
  }

  return (
    <SignedOutSurface
      eyebrow="Connectors"
      heading="Connectors bring your own tools into a thread"
      signInHref="/login?redirectTo=%2Fconnectors"
      signInLabel="Sign in to add a connector"
      secondary={{ href: '/connectors/mcp-directory', label: 'Browse the MCP directory' }}
    >
      A connector gives the assistant a scoped way to read from and act in a service you already
      run, over MCP. Which connectors you can add depends on your workspace and what an admin has
      approved, so the list needs you signed in.
    </SignedOutSurface>
  );
}

export default ConnectorsRoute;
