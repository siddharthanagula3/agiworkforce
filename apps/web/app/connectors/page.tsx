import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';
import { getRequestIdentity } from '@/lib/server/identity';
import { SignedOutSurface } from '@shared/components/marketing/SignedOutSurface';
import { reportUnreadableIdentity } from '@/lib/server/unreadable-identity';
import { CONNECTORS_COMING_SOON_DETAIL, connectorsReleased } from '@agiworkforce/types';

const SIGN_IN_LABEL = connectorsReleased()
  ? 'Sign in to add a connector'
  : 'Sign in to see connectors';
const RELEASE_NOTE = connectorsReleased() ? '' : `${CONNECTORS_COMING_SOON_DETAIL} `;

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
      signInLabel={SIGN_IN_LABEL}
      secondary={{ href: '/connectors/mcp-directory', label: 'Browse the MCP directory' }}
    >
      {RELEASE_NOTE}A connector gives the assistant a scoped way to read from and act in a service
      you already run, over MCP. Which connectors you can add depends on your workspace and what an
      admin has approved, so the list needs you signed in.
    </SignedOutSurface>
  );
}
