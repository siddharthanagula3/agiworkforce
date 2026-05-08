import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Enterprise — The same product, with the controls your security team needs',
  description:
    'SSO, SCIM, audit log export, custom retention, regional residency on request, and a four-hour SLA on a contract that names you.',
  alternates: { canonical: 'https://agiworkforce.com/enterprise' },
};

const INCLUDED: { k: string; v: string }[] = [
  { k: 'SSO', v: 'SAML 2.0 + OIDC. Okta, Azure AD, Google Workspace.' },
  { k: 'SCIM', v: 'User and group provisioning. Add and remove seats from your IdP.' },
  { k: 'Audit log', v: 'Every model call, tool execution, user action. Export to your SIEM.' },
  { k: 'Retention', v: 'Org-level retention windows. You set them.' },
  {
    k: 'BYOK enforcement',
    v: 'Force BYOK across the org. Zero managed-cloud spend unless you opt in.',
  },
  { k: 'Residency', v: 'Default us-east-2. EU on roadmap. Custom regions on contract.' },
  { k: 'SLA', v: 'Four-hour response. Named support contact.' },
  { k: 'MSA', v: 'Negotiate against your procurement. We do not require a click-through.' },
];

const COMPLIANCE: { k: string; v: string }[] = [
  { k: 'SOC 2 Type II', v: 'In progress. Audit initiated.' },
  { k: 'GDPR', v: 'DPA available on request.' },
  { k: 'HIPAA', v: 'BAA on request. Not HIPAA-certified.' },
  { k: 'ISO 27001', v: 'On the roadmap. No date claimed.' },
];

export default function EnterprisePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">
            The same product. With the controls your security team needs.
          </h1>
          <p className="agi-page-lede">
            SSO, SCIM, audit log export, custom retention, regional residency on request, and a
            four-hour SLA — on a contract that names you.{' '}
            <strong>
              One CTA at the bottom of the page. We are not going to chase you with three.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">What&rsquo;s included</p>
          <table className="agi-ledger">
            <tbody>
              {INCLUDED.map((row) => (
                <tr key={row.k}>
                  <td>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Compliance posture — honest as of today</p>
          <table className="agi-ledger">
            <tbody>
              {COMPLIANCE.map((row) => (
                <tr key={row.k}>
                  <td>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p
            className="agi-step-body"
            style={{ marginTop: 18, color: 'var(--agi-ink-quiet)', fontSize: 13 }}
          >
            We claim only what we have completed. Anything else is on the roadmap with no date until
            there&rsquo;s a date.
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Talk to us</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: '60ch' }}>
            <p className="agi-step-body" style={{ fontSize: 16 }}>
              We answer. A real human, on a real contract, against your real security review.
            </p>
            <div className="agi-cta-row">
              <Link href="/contact-sales" className="agi-cta-primary">
                Contact sales
              </Link>
              <Link href="/byok" className="agi-cta-ghost">
                Read the BYOK posture →
              </Link>
            </div>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
