import { buildMetadata } from '@/lib/seo/metadata';
import { OfflineStatus } from './OfflineStatus';

export const metadata = buildMetadata({
  title: 'No connection',
  description: 'AGI Workforce cannot reach the network right now.',
  path: '/offline',
  robots: { index: false, follow: false },
});

export default function OfflinePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">Connection</p>
          <h1 className="agi-page-h1">You&rsquo;re offline.</h1>
          <p className="agi-page-lede">
            AGI Workforce cannot reach the network. Nothing you had open was lost, and unsent
            messages stay in the composer.
          </p>
        </section>

        <section className="agi-page-section">
          <OfflineStatus />
        </section>

        <section className="agi-page-section">
          <h2 className="agi-section-h2">If the connection looks fine</h2>
          <p className="agi-page-p">
            A captive portal &mdash; hotel, airport, or office Wi-Fi that wants a sign-in first
            &mdash; looks identical to being offline. Open any other site to see whether it
            redirects you to a login page. A VPN or corporate proxy that blocks our domains produces
            the same result.
          </p>
        </section>
      </main>
    </div>
  );
}
