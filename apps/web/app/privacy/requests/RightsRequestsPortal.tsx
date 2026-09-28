'use client';

import { useState } from 'react';

import { RightsRequestForm } from './RightsRequestForm';
import { YourRightsRequests } from './YourRightsRequests';

export function RightsRequestsPortal() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <>
      <RightsRequestForm onSubmitted={() => setRefreshKey((key) => key + 1)} />
      <YourRightsRequests refreshKey={refreshKey} />
    </>
  );
}
