import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';
import { getRequestIdentity } from '@/lib/server/identity';
import { SignedOutSurface } from '@shared/components/marketing/SignedOutSurface';
import { reportUnreadableIdentity } from '@/lib/server/unreadable-identity';

async function isSignedIn(): Promise<boolean> {
  try {
    return (await getRequestIdentity()).isSignedIn;
  } catch (error) {
    reportUnreadableIdentity(error, '/connectors');
    return false;
  }
}

export default async function ConnectorsRoute() {
  if (await isSignedIn()) {
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
