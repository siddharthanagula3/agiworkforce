'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

/**
 * /forgot-password was a custom form that previously POSTed to a
 * Supabase-era /api/auth/forgot-password route (now absent). The project
 * migrated to Clerk, whose <SignIn routing="hash"> component at /login
 * includes the complete forgot-password flow (email → code → new password).
 *
 * Splitting the flow across two pages (initiate here, enter code at /login)
 * is unreliable because <SignIn> cannot resume an externally-initiated reset.
 * Redirecting here keeps the entire flow inside the single vetted Clerk widget,
 * matching the same decision made for /auth/update-password.
 */
export default function ForgotPasswordPage() {
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
