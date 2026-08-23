import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { CONTACT_EMAIL, contactMailto } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Down for maintenance',
  description: 'AGI Workforce is briefly unavailable while we finish planned maintenance.',
  path: '/maintenance',
  robots: { index: false, follow: false },
});

export default function MaintenancePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">Maintenance</p>
          <h1 className="agi-page-h1">We&rsquo;ll be back shortly.</h1>
          <p className="agi-page-lede">
            AGI Workforce is briefly unavailable while we finish planned maintenance. This is
            deliberate, not an outage, and your data is untouched.
          </p>
        </section>

        <section className="agi-page-section">
          <h2 className="agi-section-h2">What is happening to your work</h2>
          <p className="agi-page-p">
            Conversations, projects, and files are stored and unaffected. Anything that was running
            when maintenance started will either have finished or will resume; nothing is discarded
            because of this window.
          </p>
        </section>

        <section className="agi-page-section">
          <h2 className="agi-section-h2">Where to check</h2>
          <p className="agi-page-p">
            Live service state and the current window are published on{' '}
            <Link className="agi-link" href="/status">
              the status page
            </Link>
            , which is hosted separately so it stays reachable while the app is not. If something
            looks wrong after we return, write to{' '}
            <a className="agi-link" href={contactMailto('Maintenance question')}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
