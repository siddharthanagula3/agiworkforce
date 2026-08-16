'use client';

import { useRef } from 'react';
import { toast } from 'sonner';
import { useSessionTimeout } from '@shared/hooks/useSessionTimeout';

export function SessionTimeoutGuard() {
  const warnedRef = useRef(false);

  useSessionTimeout({
    onWarning: () => {
      if (warnedRef.current) return;
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
      toast.info('Signed out due to inactivity.');
    },
  });

  return null;
}
