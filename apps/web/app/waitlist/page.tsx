import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { PublicWaitlistForm } from '@/features/marketing/components/PublicWaitlistForm';
import { Reveal } from '@/features/marketing/components/Reveal';

export const metadata = buildMetadata({
  title: 'AGI Cloud is open — Team org & SSO early access',
  description:
    'AGI managed cloud is in public alpha and open by default — sign in and start, no waitlist. Team is already live at /pricing. Join the list for Team & Enterprise org-seat, admin-control, and SSO early access.',
  path: '/waitlist',
});

const WHILE_YOU_WAIT = [
  {
    title: 'Try AGI Web',
    body: 'Hosted chat with projects and artifacts, in the browser today.',
    href: '/login?redirectTo=%2Fchat',
  },
  {
    title: 'Run AGI Locally',
    body: 'Free forever, offline-capable, and never silently routed to the cloud.',
    href: '/local',
  },
  {
    title: 'Bring Your Own Keys',
    body: 'Use your provider accounts on Desktop and CLI with visible labels.',
    href: '/byok',
  },
];

export default function WaitlistPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-waitlist-h1">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">AGI Cloud · public alpha</p>
          <h1 id="agi-waitlist-h1" className="agi-fl-h1" style={{ maxWidth: '16ch' }}>
            <span className="agi-fl-h1-line">Managed compute,</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">open today.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            AGI managed cloud is in public alpha and open by default —{' '}
            <a href="/get-started" className="agi-fl-surface-link">
              sign in and start
            </a>
            , no waitlist.{' '}
            <a href="/pricing" className="agi-fl-surface-link">
              Team is already live at /pricing
            </a>
            . This list is for <strong>Enterprise early access</strong> — advanced org controls,
            SSO, custom retention, and centralized governance beyond what Team ships today. Leave
            your email and we will reach out as those land.
          </p>
          <div style={{ maxWidth: 560, marginTop: 34, paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <PublicWaitlistForm source="website" ctaLabel="Request Org/SSO Early Access" />
            <p className="agi-fl-final-stamp" style={{ marginTop: 18, textTransform: 'none' }}>
              One email when Enterprise org/SSO features land. No marketing drip, unsubscribe
              anytime.
            </p>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-waitlist-meanwhile">
          <p className="agi-fl-eyebrow">While you wait</p>
          <h2 id="agi-waitlist-meanwhile" className="agi-fl-h2">
            Three routes are open today.
          </h2>
          <div className="agi-fl-cap-grid">
            {WHILE_YOU_WAIT.map((item, i) => (
              <Reveal key={item.title} delay={i * 60} className="agi-fl-cap-cardwrap">
                <a href={item.href} className="agi-fl-cap-card">
                  <span className="agi-fl-cap-title">{item.title}</span>
                  <span className="agi-fl-cap-body">{item.body}</span>
                  <span className="agi-fl-cap-arrow" aria-hidden="true">
                    →
                  </span>
                </a>
              </Reveal>
            ))}
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
