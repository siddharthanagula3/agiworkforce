import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

export const metadata = buildMetadata({
  title: 'SLA',
  description:
    'Planned service levels for AGI Managed Cloud. Public alpha: these are targets, not a contractual commitment, and this page says which is which.',
  path: '/sla',
});

/**
 * Nothing on this page is a commitment today.
 *
 * Managed Cloud is public alpha. There is no measured uptime history published,
 * no plan-derived support routing implemented (support requests land in one
 * email queue), and no credit process wired to billing. The page therefore
 * states targets as targets and says plainly what does not exist yet, rather
 * than reading like a contract a reviewer could rely on.
 *
 * A previous version listed "Named support contact" for the top tier. No support
 * tier routing exists in this repository and a named human is a staffing claim,
 * so it has been removed rather than softened.
 *
 * Prices are deliberately absent. Plan pricing lives on /pricing and is owned
 * elsewhere; restating it here would create a second source of truth.
 */
const LAST_REVIEWED = '5 August 2026';

const UPTIME: { component: string; target: string; window: string }[] = [
  { component: 'Web (agiworkforce.com)', target: '99.9%', window: 'Monthly' },
  { component: 'API gateway', target: '99.9%', window: 'Monthly' },
  { component: 'Authentication', target: '99.9%', window: 'Monthly' },
  {
    component: 'Provider passthrough',
    target: 'Inherits the provider’s own SLA',
    window: 'Not measured by us',
  },
  {
    component: 'Local and BYOK modes',
    target: 'Not applicable — no AGI service in the path',
    window: 'Not measured',
  },
];

const RESPONSE: { tier: string; target: string; channel: string }[] = [
  { tier: 'Free', target: '48 hours', channel: 'Email' },
  { tier: 'Basic and Pro', target: '24 hours', channel: 'Priority email' },
  { tier: 'Max 5x, Max 15x, and Team', target: '8 hours', channel: 'Priority email' },
  { tier: 'Enterprise', target: '4 hours', channel: 'Priority email' },
];

const NOT_YET: { k: string; v: string }[] = [
  {
    k: 'Not contractual',
    v: 'These targets take effect only if and when a plan agreement says so. Until then they describe what we are building toward, and nothing on this page creates an obligation.',
  },
  {
    k: 'No measured history',
    v: 'We do not publish historical uptime, and we have no incident archive. The live check on /status is a point-in-time signal covering three dependencies, not an availability record.',
  },
  {
    k: 'No tiered support routing',
    v: 'Support requests currently arrive in a single email queue. There is no plan-derived priority routing implemented, so treat the response table above as a plan rather than a description of today.',
  },
  {
    k: 'No on-call rotation',
    v: 'There is no 24/7 rotation. Response is best-effort during working hours.',
  },
  {
    k: 'No recovery objectives',
    v: 'No recovery point objective, recovery time objective, or restore test evidence has been published.',
  },
  {
    k: 'No credit process yet',
    v: 'The credit formula below describes intended policy. No automated credit issuance exists, and final terms would be confirmed in a plan agreement.',
  },
];

export default function SlaPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-sla-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Service levels</p>
          <h1 id="agi-sla-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Targets we are building toward,</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">labelled as targets.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            AGI Managed Cloud is in public alpha.{' '}
            <strong>
              The numbers below are planned targets, not a binding commitment, and they take effect
              only when a plan agreement says so.
            </strong>{' '}
            Local and BYOK modes have no AGI service in the request path, so there is nothing for us
            to commit to there.
          </p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <ul className="agi-fl-mode-ribbon" aria-label="Page status">
              <li>Reviewed {LAST_REVIEWED}</li>
              <li>Public alpha · not contractual</li>
              <li>No measured uptime history</li>
            </ul>
            <div className="agi-fl-cta-row">
              <Link href="/status" className="agi-fl-cta agi-fl-cta--primary">
                See the Live Signal
              </Link>
              <a href="#limits" className="agi-fl-cta agi-fl-cta--secondary">
                What This Page Is Not
              </a>
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-sla-uptime-title">
          <p className="agi-fl-eyebrow">Planned uptime targets</p>
          <h2 id="agi-sla-uptime-title" className="agi-fl-h2">
            What we intend to commit to at general availability.
          </h2>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Component</th>
                <th>Target</th>
                <th>Measurement window</th>
              </tr>
            </thead>
            <tbody>
              {UPTIME.map((row) => (
                <tr key={row.component}>
                  <td style={{ width: '30%' }}>{row.component}</td>
                  <td style={{ width: '30%' }}>{row.target}</td>
                  <td>{row.window}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-sla-response-title">
          <p className="agi-fl-eyebrow">Planned response times</p>
          <h2 id="agi-sla-response-title" className="agi-fl-h2">
            First response, by plan, once support routing exists.
          </h2>
          <p className="agi-fl-section-lede">
            Plan names match the billing catalogue. Plan pricing is on{' '}
            <Link href="/pricing" style={{ color: 'var(--agi-ink)' }}>
              /pricing
            </Link>
            ; it is not restated here so there is only one source of truth for it.
          </p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Plan</th>
                <th>First response target</th>
                <th>Channel</th>
              </tr>
            </thead>
            <tbody>
              {RESPONSE.map((row) => (
                <tr key={row.tier}>
                  <td style={{ width: '32%' }}>{row.tier}</td>
                  <td style={{ width: '28%' }}>{row.target}</td>
                  <td>{row.channel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-sla-credits-title">
          <p className="agi-fl-eyebrow">Planned service credits</p>
          <h2 id="agi-sla-credits-title" className="agi-fl-h2">
            What we intend to owe you when we miss.
          </h2>
          <p className="agi-fl-section-lede">
            Once paid plans reach general availability, the intended policy is a service credit
            equal to 10% of the monthly fee for each 0.1% below the uptime target in that month,
            capped at 50% of the monthly fee. To claim, email{' '}
            <a href="mailto:contact@agiworkforce.com" style={{ color: 'var(--agi-ink)' }}>
              contact@agiworkforce.com
            </a>{' '}
            within 30 days of the incident. Final credit terms would be confirmed in your plan
            agreement; today no automated credit process exists.
          </p>
        </section>

        <section id="limits" className="agi-fl-section" aria-labelledby="agi-sla-limits-title">
          <p className="agi-fl-eyebrow">Limits</p>
          <h2 id="agi-sla-limits-title" className="agi-fl-h2">
            What this page is not.
          </h2>
          <p className="agi-fl-section-lede">
            A reviewer should be able to tell the difference between a commitment and an intention
            without reading the fine print, so here is the difference. As of {LAST_REVIEWED}:
          </p>
          <table className="agi-ledger">
            <tbody>
              {NOT_YET.map((row) => (
                <tr key={row.k}>
                  <td style={{ width: '26%' }}>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-sla-more-title">
          <p className="agi-fl-eyebrow">Related</p>
          <h2 id="agi-sla-more-title" className="agi-fl-h2">
            The rest of the trust surface.
          </h2>
          <div className="agi-fl-cta-row">
            <Link href="/status" className="agi-fl-cta agi-fl-cta--primary">
              Live Status
            </Link>
            <Link href="/security" className="agi-fl-cta agi-fl-cta--secondary">
              Security Mechanisms
            </Link>
            <Link href="/trust" className="agi-fl-cta agi-fl-cta--ghost">
              Dated Posture Ledger
            </Link>
            <Link href="/support" className="agi-fl-cta agi-fl-cta--ghost">
              Get Support
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
