import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Data Processing Agreement | AGI Workforce',
  description:
    'How to obtain a Data Processing Agreement (DPA) with AGI Workforce, and what it covers.',
  alternates: { canonical: 'https://agiworkforce.com/dpa' },
};

export default function DpaPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Data Processing Agreement.</h1>
          <p className="agi-page-lede">
            For customers handling personal data of EU, UK, or California residents through AGI
            Workforce.{' '}
            <strong>
              Email contact@agiworkforce.com to request our standard DPA — we send it pre-signed and
              you counter-sign.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">What our DPA covers</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>Roles</td>
                <td>
                  You are the controller; we are the processor for any personal data you submit.
                </td>
              </tr>
              <tr>
                <td>Subject matter</td>
                <td>Provision of the AGI Workforce service per your subscription.</td>
              </tr>
              <tr>
                <td>Subprocessors</td>
                <td>
                  Listed at{' '}
                  <Link href="/subprocessors" style={{ color: 'var(--agi-ink)' }}>
                    /subprocessors
                  </Link>
                  . 30-day notice on changes for Enterprise customers.
                </td>
              </tr>
              <tr>
                <td>International transfers</td>
                <td>
                  Standard Contractual Clauses (SCCs) for transfers from the EEA / UK to the United
                  States. Annex I (parties), Annex II (TOMs), and Annex III (subprocessors)
                  included.
                </td>
              </tr>
              <tr>
                <td>Security</td>
                <td>
                  Aligned with our{' '}
                  <Link href="/security" style={{ color: 'var(--agi-ink)' }}>
                    security posture
                  </Link>{' '}
                  — encryption at rest, sandboxed tool execution, RLS-enforced access.
                </td>
              </tr>
              <tr>
                <td>Term</td>
                <td>
                  Coterminous with your subscription. Survives termination as required by GDPR.
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">How to obtain</p>
          <div className="agi-cta-row">
            <a
              href="mailto:contact@agiworkforce.com?subject=DPA%20request"
              className="agi-cta-primary"
            >
              Request the DPA
            </a>
            <Link href="/privacy" className="agi-cta-ghost">
              Privacy policy →
            </Link>
            <Link href="/subprocessors" className="agi-cta-ghost">
              Subprocessors →
            </Link>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
