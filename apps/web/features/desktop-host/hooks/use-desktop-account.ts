'use client';

import { useEffect } from 'react';
import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { useCurrentUser } from '@/lib/identity/client';
import { reportDesktopAccount } from '../lib/runtime-client';

/**
 * Tells the shell which account this window is signed in as, so every AGI CLI
 * the shell runs on this machine is that same account.
 *
 * The page is the only authority on this that cannot be raced. The shell could
 * read the account from its own cookie jar instead, but Chromium commits a
 * navigation before that jar is written, so a read taken on sign-out still
 * answers with the account the user just left.
 */
export function useDesktopAccount(host: HostBridge | null): void {
  const { isLoaded, isSignedIn, user } = useCurrentUser();
  const email = user?.email ?? user?.emails[0] ?? null;

  useEffect(() => {
    if (!host || !isLoaded) return;
    void reportDesktopAccount(isSignedIn, isSignedIn ? email : null);
  }, [host, isLoaded, isSignedIn, email]);
}
