'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useSessionTimeout } from '@shared/hooks/useSessionTimeout';
import { isBrowserUserActive, subscribeBrowserActivity } from '@agiworkforce/client-runtime';

export function SessionTimeoutGuard() {
  const warnedRef = useRef(false);
  useEffect(() => subscribeBrowserActivity(() => undefined), []);

  useSessionTimeout({
    onWarning: () => {
      if (!isBrowserUserActive() || warnedRef.current) return;
      warnedRef.current = true;
      toast.warning(
        "You'll be signed out soon due to inactivity. Move the mouse to stay signed in.",
        {
          duration: 12_000,
        },
      );
    },
    onSessionExtended: () => {
      warnedRef.current = false;
    },
    onTimeout: () => {
      if (isBrowserUserActive()) toast.info('Signed out due to inactivity.');
    },
  });

  return null;
}
