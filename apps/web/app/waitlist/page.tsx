import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { WaitlistForm } from '../byok/WaitlistForm';

export const metadata: Metadata = {
  title: 'Join the AGI Cloud Waitlist',
  description:
    'Request invite access for AGI Cloud. Cloud Managed remains waitlist-only while subscription, usage, abuse, retention, and provider-cost controls are proven.',
  alternates: { canonical: 'https://agiworkforce.com/waitlist' },
};

export default function WaitlistPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">Cloud invite</p>
          <h1 className="agi-page-h1">Join the AGI Cloud waitlist.</h1>
          <p className="agi-page-lede">
            Cloud Managed is invite-only across Web, Mobile, Desktop, CLI, Chrome, and VS Code until
            subscription access, usage ledgering, abuse controls, retention, and provider-cost
            controls are proven.
          </p>
          <div style={{ maxWidth: 560, marginTop: 24 }}>
            <WaitlistForm source="other" ctaLabel="Request invite" />
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
