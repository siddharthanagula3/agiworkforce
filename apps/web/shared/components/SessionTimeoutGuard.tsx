'use client';

import { useRef } from 'react';
import { toast } from 'sonner';
import { useSessionTimeout } from '@shared/hooks/useSessionTimeout';

/**
 * Enforces the Settings → Security → Session Timeout preference for signed-in
 * users: auto-signs-out after the chosen inactivity period, with a warning
 * toast beforehand. Renders nothing. The hook self-gates on auth (every effect
 * early-returns when signed out), so this is a no-op on public/marketing pages
 * and is mounted once inside the app's QueryProvider.
 */
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
