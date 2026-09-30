'use client';

import { useEffect, useState } from 'react';
import { HEALTH_SPACE_PATH, parseHealthSpaceResponse } from '@agiworkforce/cloud-contracts';
import { useCurrentUser } from '@/lib/identity/client';

const availabilityByUser = new Map<string, Promise<boolean>>();

async function requestHealthSpaceAvailable(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_SPACE_PATH, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) return false;
    const body = parseHealthSpaceResponse(await response.json().catch(() => null));
    return body?.status === 'available';
  } catch {
    return false;
  }
}

function healthSpaceAvailableFor(userId: string): Promise<boolean> {
  let pending = availabilityByUser.get(userId);
  if (!pending) {
    pending = requestHealthSpaceAvailable();
    availabilityByUser.set(userId, pending);
  }
  return pending;
}

export function useHealthSpaceAvailable(): boolean {
  const { user, isLoaded } = useCurrentUser();
  const userId = isLoaded && user ? user.id : null;
  const [available, setAvailable] = useState<{ userId: string; value: boolean } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void healthSpaceAvailableFor(userId).then((value) => {
      if (active) setAvailable({ userId, value });
    });
    return () => {
      active = false;
    };
  }, [userId]);

  return available !== null && available.userId === userId && available.value;
}
