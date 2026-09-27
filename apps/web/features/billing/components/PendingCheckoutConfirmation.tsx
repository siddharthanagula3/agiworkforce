'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useBillingStore } from '@shared/stores/web-auth-store';
import {
  clearPendingCheckout,
  readPendingCheckout,
  type PendingCheckout,
} from '../lib/pending-checkout';

const POLL_INTERVAL_MS = 2_000;
const POLL_WINDOW_MS = 30_000;
const CONFIRMATION_PATH = '/billing';

export function PendingCheckoutConfirmation() {
  const router = useRouter();
  const pathname = usePathname();
  const subscription = useBillingStore((s) => s.subscription);
  const refreshUser = useBillingStore((s) => s.refreshUser);
  const [pending, setPending] = useState<PendingCheckout | null>(null);

  useEffect(() => {
    if (pathname === CONFIRMATION_PATH) {
      clearPendingCheckout();
      setPending(null);
      return;
    }
    const check = () => {
      if (document.visibilityState === 'visible') setPending(readPendingCheckout());
    };
    check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [pathname]);

  useEffect(() => {
    if (!pending) return;
    const startedAt = Date.now();
    void refreshUser();
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > POLL_WINDOW_MS) {
        window.clearInterval(timer);
        return;
      }
      void refreshUser();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [pending, refreshUser]);

  const activated =
    pending !== null &&
    subscription?.tier === pending.plan &&
    (subscription.status === 'active' || subscription.status === 'trialing');

  useEffect(() => {
    if (!pending || !activated) return;
    clearPendingCheckout();
    setPending(null);
    router.push(
      `${CONFIRMATION_PATH}?success=true&session_id=${encodeURIComponent(pending.sessionId)}`,
    );
  }, [activated, pending, router]);

  return null;
}
