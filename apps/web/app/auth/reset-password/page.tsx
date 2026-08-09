'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

/**
 * /auth/reset-password is the recovery URL the rest of the product already
 * points at: it is a claimed Universal Link / App Link path (see
 * `lib/server/mobile-app-association.ts`), the mobile recovery screen's "Open
 * Web Account" button opens it, and `authStore.resetPassword()` sends it as the
 * Clerk `redirectTo`. It had no page, so every one of those landed on a 404.
 *
 * Like /forgot-password and /auth/update-password, it redirects into the single
 * Clerk <SignIn> widget at /login, which owns the whole reset flow (email, code,
 * new password). Splitting the flow across two pages does not work — <SignIn>
 * cannot resume an externally-initiated reset.
 */
export default function ResetPasswordPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section
          className="agi-section"
          style={{ borderBottom: 'none', maxWidth: 440, margin: '0 auto' }}
        >
          <p className="agi-page-lede" style={{ textAlign: 'center' }}>
            Redirecting to sign in...
          </p>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
