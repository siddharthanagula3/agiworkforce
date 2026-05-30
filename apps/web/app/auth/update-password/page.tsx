'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

/**
 * /auth/update-password was the Supabase email-link callback for password
 * reset. The project migrated to Clerk, which uses a code-based reset flow
 * embedded in the <SignIn> component at /login. This page now redirects
 * there so no dead form is reachable.
 */
export default function UpdatePasswordPage() {
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
