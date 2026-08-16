'use client';

import { Suspense } from 'react';
import { useAuth } from '@clerk/nextjs';
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';
import { ConnectorsPage } from '@/features/connectors/pages/ConnectorsPage';

function ConnectorsRoute() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <Suspense>
        <ConnectorsPage />
      </Suspense>
    );
  }

  if (isSignedIn) {
    return <SettingsModalRedirect section="connectors" />;
  }

  return (
    <Suspense>
      <ConnectorsPage />
    </Suspense>
  );
}

export default ConnectorsRoute;
