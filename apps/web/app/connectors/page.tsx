'use client';

/**
 * /connectors — opens the settings modal at the Connectors section for
 * authenticated users. Unauthenticated visitors still see the public
 * ConnectorsPage directory (so marketing links work).
 */

import { Suspense } from 'react';
import { useAuth } from '@clerk/nextjs';
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';
import { ConnectorsPage } from '@/features/connectors/pages/ConnectorsPage';

function ConnectorsRoute() {
  const { isSignedIn, isLoaded } = useAuth();

  // While Clerk loads, show the public directory (avoids flash)
  if (!isLoaded) {
    return (
      <Suspense>
        <ConnectorsPage />
      </Suspense>
    );
  }

  // Signed-in users: open the settings modal at the Connectors section
  if (isSignedIn) {
    return <SettingsModalRedirect section="connectors" />;
  }

  // Unauthenticated: show public directory
  return (
    <Suspense>
      <ConnectorsPage />
    </Suspense>
  );
}

export default ConnectorsRoute;
