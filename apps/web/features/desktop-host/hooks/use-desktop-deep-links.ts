'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDesktopHost } from '../lib/host';
import { deepLinkDestination } from '../lib/deep-links';

/**
 * Routes `agiworkforce-cloud://` opens, and clicks on the notifications the
 * app itself raised, which the shell delivers back over the same channel.
 */
export function useDesktopDeepLinks(): void {
  const host = useDesktopHost();
  const router = useRouter();

  useEffect(() => {
    if (!host) return undefined;
    return host.onDeepLink((url) => {
      const destination = deepLinkDestination(url);
      if (destination) router.push(destination);
    });
  }, [host, router]);
}
