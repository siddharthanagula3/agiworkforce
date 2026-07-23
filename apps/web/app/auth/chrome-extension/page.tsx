'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

const RETURN_PATH = '/auth/chrome-extension';
const SIGN_IN_PATH = `/login?redirectTo=${encodeURIComponent(RETURN_PATH)}`;

export default function ChromeExtensionAuthCompletePage() {
  const { isLoaded, isSignedIn } = useAuth();

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header minimal />
        <div className="agi-device-auth-stage">
          <section className="agi-device-auth-card" aria-labelledby="chrome-auth-title">
            <p className="agi-section-eyebrow">AGI for Chrome</p>
            <h1 id="chrome-auth-title" className="agi-device-auth-title">
              {!isLoaded
                ? 'Checking your account.'
                : isSignedIn
                  ? 'Chrome is connected.'
                  : 'Sign in to continue.'}
            </h1>
            {!isLoaded ? (
              <p role="status" className="agi-device-auth-lede">
                Checking your AGI Cloud session…
              </p>
            ) : isSignedIn ? (
              <>
                <p role="status" className="agi-device-auth-lede">
                  Your AGI Cloud session is ready for the browser extension.
                </p>
                <div className="agi-device-auth-note">
                  Return to Chrome, then close and reopen the AGI side panel to refresh your
                  account.
                </div>
              </>
            ) : (
              <>
                <p role="alert" className="agi-device-auth-lede">
                  Sign in on the web so OAuth and your existing AGI session can be securely shared
                  with the extension.
                </p>
                <Link className="agi-cta-primary agi-device-auth-submit" href={SIGN_IN_PATH}>
                  Sign in to AGI Cloud
                </Link>
              </>
            )}
          </section>
        </div>
        <MarketingFooter />
      </main>
    </div>
  );
}
