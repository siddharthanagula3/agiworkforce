import { buildMetadata } from '@/lib/seo/metadata';
import { SessionExpiredActions } from './SessionExpiredActions';

export const metadata = buildMetadata({
  title: 'Session expired',
  description: 'Your sign-in has expired. Sign in again to pick up where you left off.',
  path: '/session-expired',
  robots: { index: false, follow: false },
});

export default function SessionExpiredPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">Signed out</p>
          <h1 className="agi-page-h1">Your session expired.</h1>
          <p className="agi-page-lede">
            Sign-ins last a limited time, so this happens on its own after a while. Nothing you
            saved was lost.
          </p>
        </section>

        <section className="agi-page-section">
          <SessionExpiredActions />
        </section>

        <section className="agi-page-section">
          <h2 className="agi-section-h2">Why this happens</h2>
          <p className="agi-page-p">
            A session ends when it reaches its lifetime, when you sign out on another device, or
            after a long stretch of inactivity. Signing in again issues a fresh one; you do not need
            to clear anything or reinstall.
          </p>
          <p className="agi-page-p">
            If you are sent back here immediately after signing in, third-party cookies are usually
            the cause. Allow cookies for this site, then try again.
          </p>
        </section>
      </main>
    </div>
  );
}
